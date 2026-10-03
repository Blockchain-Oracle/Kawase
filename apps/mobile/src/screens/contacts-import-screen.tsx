// Import from the phone's contacts (I7: optional, privacy-gated). Nothing leaves the phone until the person asks:
// with their permission the app reads names and emails here, and only on "Find who's on Kawase" does it send
// SHA-256 hashes of those emails (never the emails, names or numbers) to match Kawase @handles — of people who let
// others who have their email find them. A match is saved as a contact by its @handle in one tap; the rest can be
// invited. The person can also choose whether others can find them the same way. A big address book goes in several
// checks, and the api allows a few address books a day (M11).
import * as Crypto from "expo-crypto";
import { Contact as DeviceContact, ContactField, requestPermissionsAsync } from "expo-contacts";
import { useRouter } from "expo-router";
import { Check, ContactRound, Search, Send } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, Linking, Platform, Share, View } from "react-native";
import { toast } from "sonner-native";

import { ApiError, type DiscoverInput, type DiscoverMatch } from "@kawase/api-client";
import { PUBLIC_LINKS } from "@kawase/config";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Switch } from "@kawase/ui-native/components/ui/switch";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page, Section } from "@/account/page";
import { useT } from "@/i18n";
import { api } from "@/session/api";

type Person = { ref: string; name: string; emails: string[] };
type Stage = "intro" | "reading" | "denied" | "ready" | "matching" | "matched";

const AVATAR = 32;
const EMAILS_PER_PERSON = 5;
const PEOPLE_MAX = 500;
const SHOWN_OTHERS = 40;
/** The api checks at most this many email fingerprints at once (M11): a bigger address book goes in several checks. */
const HASHES_PER_CHECK = 1_000;

/** The chosen contacts in checks of at most HASHES_PER_CHECK fingerprints, in order. */
function inChecks(contacts: DiscoverInput["contacts"]): DiscoverInput[] {
  const checks: DiscoverInput[] = [];
  let current: DiscoverInput["contacts"] = [];
  let hashes = 0;
  for (const contact of contacts) {
    if (current.length > 0 && hashes + contact.emailHashes.length > HASHES_PER_CHECK) {
      checks.push({ contacts: current });
      current = [];
      hashes = 0;
    }
    current.push(contact);
    hashes += contact.emailHashes.length;
  }
  if (current.length > 0) checks.push({ contacts: current });
  return checks;
}

const hashEmail = (email: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, email.trim().toLowerCase());

export function ContactsImportScreen() {
  const { t } = useT();
  const router = useRouter();
  const [stage, setStage] = React.useState<Stage>("intro");
  const [people, setPeople] = React.useState<Person[]>([]);
  const [matches, setMatches] = React.useState<Map<string, string>>(new Map());
  const [added, setAdded] = React.useState<Set<string>>(new Set());
  const [discoverable, setDiscoverable] = React.useState<boolean>();

  React.useEffect(() => {
    void api.discover
      .get()
      .then(({ discoverable: on }) => setDiscoverable(on))
      .catch(() => undefined);
  }, []);

  const read = async () => {
    setStage("reading");
    try {
      const permission = await requestPermissionsAsync();
      if (!permission.granted) {
        setStage("denied");
        return;
      }
      const all = await DeviceContact.getAllDetails([ContactField.FULL_NAME, ContactField.EMAILS] as const, { limit: PEOPLE_MAX });
      setPeople(
        all
          .map((contact) => ({
            ref: contact.id,
            name: contact.fullName ?? "",
            emails: (contact.emails ?? []).flatMap((email) => (email.address ? [email.address] : [])).slice(0, EMAILS_PER_PERSON),
          }))
          .filter((person) => person.name),
      );
      setStage("ready");
    } catch {
      setStage("denied");
    }
  };

  const find = async () => {
    setStage("matching");
    try {
      const contacts = await Promise.all(
        people.filter((person) => person.emails.length > 0).map(async (person) => ({ ref: person.ref, emailHashes: await Promise.all(person.emails.map(hashEmail)) })),
      );
      // One check after another; past the day's quota, what was found so far still shows, with the reason.
      const found: DiscoverMatch[] = [];
      let checked = 0;
      for (const check of inChecks(contacts)) {
        try {
          found.push(...(await api.discover.match(check)).matches);
          checked += 1;
        } catch (error) {
          if (!(error instanceof ApiError && error.code === "discovery_quota")) throw error;
          toast(t("importContacts.quotaReached"));
          break;
        }
      }
      setMatches(new Map(found.map((match) => [match.ref, match.handle])));
      setStage(checked > 0 || contacts.length === 0 ? "matched" : "ready");
    } catch {
      toast(t("common.error"));
      setStage("ready");
    }
  };

  const add = async (person: Person, handle: string) => {
    try {
      await api.contacts.create({ displayName: person.name, address: `@${handle}`, source: "handle" });
      setAdded((current) => new Set(current).add(person.ref));
    } catch {
      toast(t("importContacts.addFailed", { name: person.name }));
    }
  };

  const invite = (person: Person) =>
    void Share.share({ message: t("importContacts.inviteMessage", { name: person.name, link: PUBLIC_LINKS.landing }) }).catch(() => undefined);

  const onKawase = people.filter((person) => matches.has(person.ref));
  const others = people.filter((person) => !matches.has(person.ref)).slice(0, SHOWN_OTHERS);

  return (
    <Page title={t("importContacts.title")}>
      {Platform.OS === "web" ? (
        <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>{t("importContacts.phoneOnly")}</Text>
      ) : stage === "intro" || stage === "reading" ? (
        <View className="gap-4">
          <Icon as={ContactRound} className="text-muted-foreground size-10" />
          <Text className={cn("text-foreground text-base leading-6", TEXT_START)}>{t("importContacts.intro")}</Text>
          <Button disabled={stage === "reading"} onPress={() => void read()}>
            <Text>{t("importContacts.allow")}</Text>
          </Button>
        </View>
      ) : stage === "denied" ? (
        <View className="gap-3">
          <Text className={cn("text-foreground text-base leading-6", TEXT_START)}>{t("importContacts.denied")}</Text>
          <Button variant="secondary" onPress={() => void Linking.openSettings()}>
            <Text>{t("scan.openSettings")}</Text>
          </Button>
        </View>
      ) : (
        <>
          {stage !== "matched" ? (
            <View className="gap-3">
              <Text className={cn("text-foreground text-base leading-6", TEXT_START)}>{t("importContacts.findBody", { count: people.length })}</Text>
              <Button disabled={stage === "matching"} onPress={() => void find()}>
                {stage === "matching" ? <ActivityIndicator /> : <Icon as={Search} className="text-primary-foreground size-4" />}
                <Text>{t("importContacts.find")}</Text>
              </Button>
              <Text className={cn("text-muted-foreground px-1 text-xs leading-5", TEXT_START)}>{t("importContacts.privacy")}</Text>
            </View>
          ) : null}

          {stage === "matched" ? (
            <Section title={t("importContacts.onKawase", { count: onKawase.length })}>
              {onKawase.length > 0 ? (
                <ListGroup>
                  {onKawase.map((person) => {
                    const handle = matches.get(person.ref)!;
                    const done = added.has(person.ref);
                    return (
                      <ListRow
                        key={person.ref}
                        leading={<DefaultAvatar seed={handle} size={AVATAR} label={person.name} />}
                        title={person.name}
                        subtitle={`@${handle}`}
                        trailing={
                          done ? (
                            <Icon as={Check} className="text-success size-5" />
                          ) : (
                            <Button size="sm" onPress={() => void add(person, handle)}>
                              <Text>{t("importContacts.add")}</Text>
                            </Button>
                          )
                        }
                      />
                    );
                  })}
                </ListGroup>
              ) : (
                <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("importContacts.noneOnKawase")}</Text>
              )}
            </Section>
          ) : null}

          {stage === "matched" && others.length > 0 ? (
            <Section title={t("importContacts.others")}>
              <ListGroup>
                {others.map((person) => (
                  <ListRow
                    key={person.ref}
                    leading={<DefaultAvatar seed={person.ref} size={AVATAR} label={person.name} />}
                    title={person.name}
                    trailing={
                      <Button size="sm" variant="secondary" accessibilityLabel={t("importContacts.invite", { name: person.name })} onPress={() => invite(person)}>
                        <Icon as={Send} className="size-4" />
                      </Button>
                    }
                  />
                ))}
              </ListGroup>
            </Section>
          ) : null}

          {stage === "matched" && added.size > 0 ? (
            <Button variant="secondary" onPress={() => router.back()}>
              <Text>{t("importContacts.done")}</Text>
            </Button>
          ) : null}
        </>
      )}

      {discoverable !== undefined ? (
        <View className="gap-2">
          <ListGroup>
            <ListRow
              title={t("importContacts.findable")}
              trailing={
                <Switch
                  checked={discoverable}
                  onCheckedChange={(on) => {
                    setDiscoverable(on);
                    void api.discover.set(on).catch(() => setDiscoverable(!on));
                  }}
                  accessibilityLabel={t("importContacts.findable")}
                />
              }
            />
          </ListGroup>
          <Text className={cn("text-muted-foreground px-1 text-xs leading-5", TEXT_START)}>{t("importContacts.findableBody")}</Text>
        </View>
      ) : null}
    </Page>
  );
}
