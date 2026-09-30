# Tameion Kick Off [repeat] — transcript

Purpose: the full transcript of the second Tameion kickoff session, so the library has the organizers' spoken guidance (not just the slides).
Sources: https://www.youtube.com/live/DE0hqGa0CuY (Canteen, livestream 2026-09-29, 52:52). Transcribed locally with whisper.cpp `ggml-small.en`. This is machine transcription, so expect misheard words (e.g. "us YC" = USYC, "RFP" = RFB, "erc" = EURC).
Verified: 2026-09-29

## Points relevant to Kawase (quoted, with transcript line numbers)

- **On-chain limits (the point Abu asked about):** "you've got smart contracts that you can use to basically use code to enforce specific rules, and not just trust the agents to follow what you said in MD file, which obviously is not enough." (line 221). This came in the same sentence as CCTP and Gateway, which is why the two blurred together. It matches the plan's ERC-7710 delegation caveats (`plan/ARCHITECTURE.md` §4) and spike #4.
- **Agent Stack:** "You can give an agent its own wallet let it pay, keep it inside the guardrails that you've defined." (line 212)
- **Wallets:** "You can give a company on main treasury wallets, you can give smaller wallets per team, or one per contractor" (line 219)
- **Tools:** "you absolutely don't have to use all of these, a lot of strong projects, just use a couple." (line 225)
- **RFB 4:** an agent "can stay within limits that you've set for it" (line 176). **RFB 5:** "create limits scale to risk" (line 182).
- **Ledgers essay:** it's there so you avoid "a full system with agents plugged in, where everything balances out perfectly and you don't even know about the errors that are happening." (line 207)

## Full transcript

     1	[BLANK_AUDIO]
     2	[BLANK_AUDIO]
     3	[BLANK_AUDIO]
     4	[BLANK_AUDIO]
     5	[BLANK_AUDIO]
     6	[BLANK_AUDIO]
     7	[BLANK_AUDIO]
     8	[BLANK_AUDIO]
     9	[BLANK_AUDIO]
    10	All right. Hello, everyone.
    11	I'm gonna give people a second to hop on the stream.
    12	[BLANK_AUDIO]
    13	Send something in the chat to confirm that you guys can hear me.
    14	[BLANK_AUDIO]
    15	I see that we're live.
    16	[BLANK_AUDIO]
    17	I'll give you guys a second to respond.
    18	Yo, yo, fortune says pump.
    19	What's up?
    20	[LAUGH]
    21	[BLANK_AUDIO]
    22	Nice. Send me in the chat like where are you guys building from?
    23	[BLANK_AUDIO]
    24	Let's see how global we are.
    25	[BLANK_AUDIO]
    26	Osama Ivan and fortune says pump.
    27	[BLANK_AUDIO]
    28	Hey, Jay.
    29	I'm saying it right.
    30	[BLANK_AUDIO]
    31	Hello to you too.
    32	[BLANK_AUDIO]
    33	So are you guys watching from, okay, Bangladesh.
    34	[BLANK_AUDIO]
    35	Nice.
    36	I'm streaming this from Belgrade, Serbia.
    37	[LAUGH]
    38	Probably your last guess.
    39	[LAUGH]
    40	For a team based in NYC mostly.
    41	Nigeria.
    42	Syria.
    43	Also Nigeria.
    44	Okay.
    45	Are you guys friends?
    46	[LAUGH]
    47	Jay and fortune says pump.
    48	Cool.
    49	All right.
    50	Let's get this show started.
    51	Thank you guys for hopping in.
    52	We're gonna be going through all the general info, some main links to know what's the hackathon about,
    53	what problem are we tackling, what are the options, et cetera.
    54	So first things first.
    55	So who are the hosts of this hackathon?
    56	First off, it's Canteen.
    57	I'm a member of Canteen.
    58	Canteen is the one hosting.
    59	And curating, organizing the whole hackathon.
    60	Canteen is essentially a research and technology firm.
    61	It's a team of builders, investors, and engineers that are operating at the intersection of AI
    62	and payments and markets, as you can see.
    63	Circle is the platform.
    64	It's the issuer of USDC, of EURC, and of the most widely used stablecoin network,
    65	which brings us to ARC, which is the settlement layer for this hackathon.
    66	It's Circle's purpose-built L1, has USDC as gas, very fast finality, et cetera,
    67	making like lots of small payments very, very affordable.
    68	And Tamion is the third event in this series of agent and payment focused hackathons.
    69	We had Agora, we had Lepton, and now this is Tamion.
    70	Oh, maybe you guys are friends.
    71	Ivan, you were on the first kickoff as well.
    72	You liked it so much.
    73	All right, you're going to get like a drink from me if we meet up in person any time.
    74	Moving on, what are the other friends of Canteen?
    75	We've got Testmet that you can use to get more Testnet tokens for ARC Testnet
    76	if the faucet isn't cutting it.
    77	And we've got AOMI.
    78	And the AOMI Labs team is essentially building the execution harness for on-chain finance.
    79	Quickly, like soon after this session,
    80	they're going to be doing a session about building on-chain agents safely.
    81	And after that, right after that, they're going to have their office hours.
    82	So you can ask any question about their tech or implementing anything related to their product suite
    83	or the session that they had.
    84	All right, and who am I?
    85	Well, as you can see by my subtitle, my name is Alisha.
    86	My main role, like we've never officially come up with a name of my role,
    87	but like my first priority is helping hackers, helping you guys build the best projects possible
    88	in the next two weeks and beyond.
    89	So I just call the helping hackers at Canteen.
    90	Apart from that, I'm also a cloud community ambassador.
    91	So I'm going to be organizing a bunch of cloud events in the future.
    92	When I say that, people ask me like, are we allowed to use any other type of LLM or agents?
    93	Of course, I'm just mainly a cloud guy.
    94	But basically, since throughout the past five or six years,
    95	I've been wearing a lot of hats throughout my career.
    96	You can give me a bunch of different titles, but essentially I'm a dev rel engineer.
    97	I'm a combination of an engineer, of a project manager, of a content creator.
    98	I've maintained a bunch of docs, including polka dots.
    99	I've been building since 2020.
   100	I've been in web three since 2022.
   101	I've been organizing community events and like a thousand plus attendee conferences, you know,
   102	for as long as I've been a builder.
   103	And I've been doing like a bunch of courses and webinars and talks and workshops at events
   104	and like my own events, also like for the past five years.
   105	So I've done a bunch of stuff.
   106	I'm super happy to be helping you guys.
   107	I'm super happy to be like involved in an open source community.
   108	So all of this, super exciting to me.
   109	Outside of work, I like to, you know, do stuff like skydiving and like mountain climbing, hiking,
   110	very optional side quests.
   111	But yeah, I've climbed two out of the seven summits and throughout the next weeks, I won't be climbing any mountains,
   112	but I'll be helping you guys climb your own mountains of sorts through agents and payments.
   113	Yeah, that's my, that's my segue to move on to like, what is actually the thing that we're going to be tackling here?
   114	Let me look at the comments.
   115	All right, cool. Thanks, guys.
   116	Appreciate. I appreciate the positivity.
   117	So what are we actually going to be tackling here?
   118	The main, the main issue that we have right now, compared to like the tech that we have right now is that,
   119	you know, a lot of businesses have cash in several accounts that are that are just sitting there.
   120	They're not earning anything.
   121	You've got invoices owed out and owed in.
   122	You've got contractors waiting on milestones.
   123	You've got a bunch of subscriptions that are renewing, whether or not, you know, like anyone even opened the tool.
   124	You've got a bunch of like compliance complications.
   125	And if you're a global business that compounds like across countries, across currencies, across rails, across time zones.
   126	And like who's the one, like how our business is even tackling this.
   127	Like who's deciding on like what decision to make for which of these like situations and problems.
   128	It's just a random guy or girl just reading a spreadsheet on a Tuesday.
   129	And we don't really have to do things that way, because we've got all this new and awesome tech that we can leverage.
   130	And the thing is, like none of these individual decisions are hard on their own.
   131	It's about there being like a thousand decisions to make at a time and all of these decisions being interdependent.
   132	This is my slide to which we represent a thousand interdependent decisions.
   133	I hope you like my emojis.
   134	So it's not hard on an individual level. It's hard on a practical level, like how often they come up and how interconnected they are.
   135	So the main issue is that before software couldn't really hold and move the money.
   136	But that's not really like where we're at right now. This is exactly the kind of work an AI agent is built for. And this is exactly the type of financial.
   137	You know, financial moves that can be handled on Arc in a very, in a very easy and unprofitable way.
   138	So how does Arc change this? Well, you've got transactions with fees that are around the cent and they're paid in USDC, which is a stablecoin.
   139	And usually the native token of a blockchain is a volatile token. So already there, you have something that businesses can rely on.
   140	Arc is also, you know, compliance ready, which is also very important for businesses, you know, moving their funds on a blockchain.
   141	You've got finality being under half a second while on other chains, it can be 13 minutes, 60 minutes.
   142	You've got CCTV and Gateway to let an agency and move funds across chains as one balance on chain FX converts, you know, between stable currencies and as money process markets.
   143	You can do so many things right off the bat, leveraging existing tech like this.
   144	So, WTF is Tammy on Tammy on is the ancient Greek word for Treasury. So it literally means the room the money was kept in.
   145	And back in Byzantium.
   146	There was this room called the Vestal area.
   147	And that was the Emperor's wardrobe department.
   148	The Emperor would keep like all their silk there all their clothes, but they also started keeping coins in there, and they also over some time, started minting coins in that room, and they started paying the army from that room.
   149	So that room evolved into a Tammy on basically.
   150	And the seal that you can see on the Tammy on website, it belonged to a record keeper of that time.
   151	And the record keeper was called the chart to Larry's I'm butchering that name for sure but like, it's fine. Byzantium doesn't really exist anymore.
   152	If all of that sounds familiar, that's because trusting someone else to spend your money is an old problem, and we have the old job back in a new form.
   153	We've got AI agents managing businesses money on the owners behalf, and that's how it ties back into Tammy on and all that rich history. So, let's get practical.
   154	We have five requests for builders that you can see on the Tammy on site that we've made so we give you guys like a really straight and concrete direction, you, you guys can build in.
   155	Can you build anything outside of these five, absolutely, like number six is always going to be there, and it's surprises.
   156	This is just so you guys know like what, what are the judges, and arc, what are they going to value, and what what metrics to to prioritize.
   157	Let me just check the comments for a second. Okay, we're good.
   158	So, RFP, number one, we've got intelligent business treasury. So you've got like cash spread across accounts and chains that earns nothing while it waits.
   159	So you can have the AI figure out cash flow forecasting and runway, you can have it figure out allocation across accounts and entities, when to deploy cash, when to preserve it.
   160	You can deploy idle funds into something like US YC, which can give you back yield for keeping funds there can figure out you know when to redeem cash based on the context that's going on when the cash is needed.
   161	You can give you budget warnings, a lot of stuff. So if you're going for RFP one, the metrics that we value are you know businesses using it real businesses, total funds under management, cash flow forecast accuracy, treasury operations,
   162	automated per week.
   163	If you're going for RFP two. So that's like a PR automation agents, you've got invoices still being read by hand paid at whenever paid at like whatever moments.
   164	Someone gets to them so obviously that sucks. It's tedious, it's error prone, and you know, it's just an invitation for fraud.
   165	So what can I do, you can read invoices emails contracts to work out what is though it can decide between an early payout discount or preserving cash.
   166	It can figure out duplicate and fraud detection. It can screen Avengers wallet before paying, it can match payments invoices.
   167	For each of these on Tammy and side you also have examples of projects already built that do something like this.
   168	So the metrics that are important for RFP to our invoices process total payments volume days payable and receivable outstanding before and after, and duplicate voices caught.
   169	RFP three contractor and vendor network manager.
   170	So you've got like dozens of vendors, and you have like no memory of which ones were any good, or at least you don't have anything written down throughout the process.
   171	So what can you do, you can you can make an AI that's going to figure out payment scheduling against milestones.
   172	It can in real time, build out the reputation of specific vendors from delivery and quality and not just testimonials that you, you've gotten collected.
   173	It can screen and onboarding, even before the first payment, it can use market data to to negotiate a better price, it can discover different vendors match them, compared to the needs that the business has, they can, it can be a lot.
   174	So the metrics that matter here are contractors and vendors managed, like the number of them total payment volume on time payment rates and vendors satisfaction.
   175	RFP four autonomous business operator. So revenue comes in, bills are due, and a person still sits between every dollar in and every dollar out like this is, this is the person like checking out spreadsheets on a Tuesday, this is what I mentioned.
   176	So, an agent can receive and hold us DC can watch cash against obligations you can decide when to pay a vendor or buy a service move funds, and it can stay within limits that you've set for it.
   177	The metrics that matter are businesses operated totally with DC received and paid out obligations settled on time without a human touching them decisions made versus the ones escalated, and how often the human agreed.
   178	In regards to like those, those decisions that were escalated.
   179	And RFP number five compliance intelligence agents. So, screen today is essentially a yes or no check.
   180	It's run once at the moment of payments, or what businesses actually need is a continuous check, so continuous monitoring.
   181	So you can have an agent that does risk to your responses, and it provides visibility into indirect exposure, it can figure out which indirect exposure that you should be paying attention to, and maybe which ones are not as important.
   182	Again, it can create limits scale to risk, and it can figure out, you know, how often to rescreen, a bunch of stuff like that.
   183	So the metrics that matter here are addresses monitored alerts generated and resolved risk events caught the for the transaction and compliance reports generated.
   184	You might be asking me, like I just shot will actually start, I get like this, this is the direction I can go in.
   185	But where do I go from here.
   186	Like the highest leverage thing that you can do if you're just starting out, and you want to tackle this subject.
   187	Well, I really, really advise you guys to read the blog that we posted on the canteen website, because we read the source of nine open source accounting systems, so you don't have to.
   188	There you've got the comparison of how they, how each of them implemented specific parts of these accounting systems, like, like invoicing and transactions, and how, how specific rules work on a low level.
   189	You might think that reading a blog in 2026 is cringe, but this is, this is the best read that you're that you can have for for the Tammy on hackathon.
   190	It's totally public. It's not like a lead magnet or anything.
   191	I think that's 100% worth your time. If you, if you want to do this, well, you can absolutely give, give this blog to your agent, have it read it back to you and explain like specific points, whichever way works.
   192	I'm just telling you like for real, like, read this first, and then figure out, like, which of these open source projects are you going to build on top of, or if you're not.
   193	That's really fine too, but you're going to know why instead of not building on top of these from ignorance, but there's no need to like reinvent the wheel.
   194	And this blog also showcases how plugging in agents into an accounting system, it opens up the whole system to a totally new set of errors that an LLM can make.
   195	Because every accounting system, it does a double entry check, which is basically checking that the debits and the credits match on both sides.
   196	But as I said, an LLM can do a bunch of stuff that passes that check, but still saves or uploads something that isn't correct.
   197	Some of those errors are that it can put in the wrong amount, but it can still equal out on both sides, it can be wrong on both sides.
   198	It can put in the correct amount, but it can be the wrong vendor.
   199	It can just not be recorded.
   200	It can, an asset can be booked as an expense.
   201	It can cancel each other out. The debit and the credit, they can be swapped. So the double entry check still passes in that, in that way as well.
   202	Someone says I have an idea on what to build now. Thank you.
   203	That's, that's the best comment that I could have seen, like, that's the whole point of doing sessions like this, and I'm, I'm super happy.
   204	You're going to be inspired through this. Awesome.
   205	Hit me up if you need any advice or direction.
   206	And at the end of the blog you also have like concrete advice for this design decision that you should make. So I definitely advise you checking it out.
   207	If you go through this, you're going to avoid the situation where you make a full system with agents plugged in, where everything balances out perfectly and you don't even know about the errors that are happening.
   208	Okay.
   209	So let's go through the rail, the rail as in the infrastructure is that you guys are going to be building on top of moving money on.
   210	You've got arc plus circles developer tools that are running on it.
   211	You've got the agent stack.
   212	You can give an agent its own wallet let it pay, keep it inside the guardrails that you've defined.
   213	You've got our docs.
   214	You can find you know the network config sample apps.
   215	And you also have arc dash canteen dev.
   216	It's also going to be linked, I think at the end of the slides, and a bunch more canteen and arc resources you can find in the arc one on one session that I did.
   217	So I can also, I can link to it again in the discord. If you haven't joined the discord, absolutely join the discord. I've been like finding people that are registered, but still haven't joined and they're missing out a lot, missing out on a lot.
   218	Okay, so let's talk about primitives for a bit. So, as I said, you can give an agent a wallet, wallet, you know, being just a bank account, it can use.
   219	You can give a company on main treasury wallets, you can give smaller wallets per team, or one per contractor, and you can easily track all of them.
   220	So if a contractor wants to be paid on a different blockchain, cctp moves, moves real usdc from one chain to another gateway allows you to have like one usdc balance across multiple chains, which is very awesome.
   221	As I mentioned before us YC, which is a way for, you know, idle usdc to earn you yield, instead of just sitting there, you've got smart contracts that you can use to basically use code to enforce specific rules, and not just trust the agents to follow
   222	what you said in MD file, which obviously is not enough.
   223	usdc and erc are digital dollars and digital euros, both native on Arc.
   224	If a European vendor invoices in euros, the agent pays them in euros, and that's it.
   225	And, you know, you absolutely don't have to use all of these, a lot of strong projects, just use a couple.
   226	But I just wanted to highlight them. So you kind of, you kind of get a feel for, you know, the landscape of arcs, primitives.
   227	We've got a bunch of sample apps already built, like related to, you know, for a multi chain wallet for nano payments for p2p payments are e commerce payments like the file lending the file and borrow flow bunch of stuff is already built out, you can just
   228	leverage that and really, like in 24 hours like you can do so much.
   229	Make them remix them, make them your own.
   230	It's pretty cool.
   231	Also you've got app kits. So you can basically install an all in one app kit SDK, or you install like individual bits and pieces of it.
   232	So you can build payments and payments and liquidity workflows across blockchains.
   233	And that's also like already built out and had handed to you on a platter.
   234	Okay, judging.
   235	Waitings are essentially recommendations judges have the final say, and the best projects tend to break the rules.
   236	But you should know that essentially 30% is a genetic sophistication. So if an agent chooses to pay for something and can explain why that's a lot better than a cron job, obviously.
   237	30% is traction, and we'll talk about traction.
   238	20% is circle tool usage. So, have you leveraged, and then what useful way the primitives that I mentioned, and 20% is innovation.
   239	Like have you, have you crossed into new territory of you.
   240	Did you do something like super creative with your projects.
   241	Okay.
   242	So regarding traction inflated for follower counts on x does not count as traction, we've got people like a bunch of times just buying bought accounts getting followers for their projects x.
   243	That's not really what we're looking for.
   244	And builders tend to kind of disregard the traction aspect, and they think my project build will speak for itself, and I'm just going to focus on that.
   245	But getting traction is valued as much as complicated Asian flow.
   246	So, but it's not even it's not even about judges grading your project.
   247	But getting traction is getting real businesses, real users, to get to use your project to use your product, and to get real value from it.
   248	And mainnet transactions and actual use DC and not testing us DC is valued more.
   249	You don't have to deploy the main name, but it's highly recommended.
   250	And why you should bother is that to be a successful builder, if you're if you're thinking like but I'm a builder I'm not a founder to be a successful builder.
   251	You just got to make something that people actually want something that provides value to your users, because if you're not building something useful.
   252	There's no real points in building it. You can just build with Legos.
   253	And if you are building something people actually want and providing value, you are a founder. All of you are founder material.
   254	And some of you already are founders, and you're about to kick off you know the next chapter of your founder journey.
   255	And what I'm trying to get across here is that people tend to just jump through the hackathon hoops.
   256	They get to the prizes of the hackathon.
   257	But you guys have the ability and the opportunity to change the way people do business through agents managing money of those businesses.
   258	And that should be what you're striving for. And through doing that, you can get support like way past the price pool of of this hackathon.
   259	You can definitely define your ideal customer persona, new know who you're targeting start small.
   260	And if you're going to tell me that you don't have any anyone in your network that you can target for for your product.
   261	Through the network of friends. I got to the CEO of of conference in Europe that has over 15,000 attendees.
   262	That's a very busy person that I never would have been able to like get in touch with.
   263	We didn't have a mutual friend, but we never that never would have happened if I didn't ask one of my, one of my friends, if, if they know like a specific type of person that I'm targeting.
   264	And now they're the design partner for a tool that I'm building.
   265	So definitely talk to your ideal customer personas on a weekly basis, or even more, and definitely read the mom test if you haven't, because it's very important for the way that you're going to conduct those conversations and interviews.
   266	So you don't keep getting false positives or false negatives.
   267	LinkedIn is usually cringe, but if you're direct authentic and concise.
   268	A lot of people will just, you know, take 15 or 20 minutes out of the day to help you out.
   269	If you can provide value for them, you know, everything else kind of clicks into place.
   270	You can also organize events to provide value to the people that you're targeting and or just organically you guys are going to figure out ways to work together because you can help each other.
   271	I'm just looking at the comments for a second. Okay, you're having a hard time figuring out how you're having a hard time figuring out traction well I'm going to, I'm going to talk about traction, I'm talking about traction right now.
   272	So, another thing that I recommend you guys read is Paul Graham's users posts, because if you can explain to me what you've learned from users in the past few days weeks months, then I know that you're going in the right direction, if you haven't.
   273	If you don't have anything to tell me when I asked you this, I know that you're just going from, from the dome, and you definitely need to confront your assumptions with reality and with real people.
   274	You need to be paying attention to users need to be paying attention to how well you understand them, and how much they need the thing that you're making.
   275	And the thing is, building a startup, or building you know a scalable product is counterintuitive, and a lot of times, why see founders, don't try, don't listen to why see mentors, like the first time they come back a year later saying, telling the mentors that
   276	Paul Graham writes about that. And that's because they're using intuition in a field where they don't have experience yet. So what I want you guys to know the startups are counterintuitive.
   277	You can only get better at building them by experience. So the only way to actually become better is to have a feedback loop with users to know like which assumptions are correct and which aren't.
   278	And as a founder, you're going to be uncertain about next steps, and that's absolutely fine. That's absolutely a part of the process. It can't really be any other way, because you're, by definition, you're doing something new.
   279	And if you're doing something new, next steps are going to be foggy but that's just a part of it.
   280	And Paul Graham also says, the startups are defined by speed. So, you're either a fast startup, or you're a dead startup, you need to be iterating very quickly and you need to be doing like quick focused steps that are going to prove or disprove your
   281	assumptions in days, or maybe even hours, and you just keep moving.
   282	So, speaking of fast, you guys have two weeks to build a thing and to get users for it in two weeks is definitely more than enough. If you're actually building something that people want.
   283	So, in Patrick Collinson's fast posts.
   284	He lists out a set of amazing things that have been built in a crazy short span of time.
   285	Some of them are Apollo 8. So on August 9 in 1968, NASA decided that Apollo 8 should go to the moon, and it launched in December. So something that they decided on in August was launched in December 21 of the same year.
   286	The Eiffel Tower, which was at the time the tallest building in the world was built in two years and two months.
   287	JavaScript, the first prototype was implemented in 10 days.
   288	So if JavaScript could be built in 10 days, you can definitely with agents, build a thing in two weeks, and get someone to use it, if it's, if it's worth using.
   289	You can definitely leverage everything at your disposal in 2026, because in 2026, you've got tools like origami chat, like this is a website.
   290	They literally get customers for you, like it's, it's GTM squared.
   291	Definitely check them out in similar tools.
   292	You've got resources like Lenny's podcasts, and you've got blogs, and you've got like all the data public from all of those podcasts and all of these blogs.
   293	You even have a blog here explaining how to like build an MCP and plug it into all that data.
   294	You can get advice from like the coolest and most successful founder people on the planet.
   295	And just to give you an idea of like how outside the box, you, you can go.
   296	I don't know if you know the Airbnb story, but they listed their own apartments for so they were basically their first users.
   297	And your first user can be a freelancer that is invoicing clients your first user can be an agency that has a bunch of subscriptions that they're not even using your first user can be your own business.
   298	It can be anybody that has some funds and is moving them for like specific services and partnerships that they're doing, it doesn't have to be anything crazy like the Airbnb guys listed their own apartment.
   299	And that was their first listing and then they went door to door to take photographs of other existing listings that they got later on to make the listings more attractive, because people are uploading bad pictures.
   300	And that's the length that they went to get get everything moving in the beginning Shazam didn't have a music database, because nobody had it first of all, they didn't have access to a music database, but also nothing was digitalized yet.
   301	So they made a deal with CD distributors, and they hired a bunch of teenagers and college kids.
   302	And for nine months they were pulling CDs off, off the shelves, using Shazam software to make a digital library.
   303	They got it for free because they did the service for for the distributors. And, and that's, that's what allowed them to launch Shazam, even before an app store was a thing.
   304	You just dialed 2580.
   305	If I remember, and, and the phone on call would record the music and you would find songs name.
   306	Fresh just launched landing page with the PDFs of restaurants that signed up, and they were the ones, the ones taking calls to, to, you know, booked, booked the orders of those restaurants.
   307	Dropbox for like a simple demo video, it went viral, and they got their weightless signups from 5000 to 75,000 overnight.
   308	Etsy, the founders went to craft fairs in person to recruit, you know, sellers one by one.
   309	So, when I show you guys this prize pool, and you see that, you know, you can get 10k if your first place 7.5 K if your second place three teams will get third place, which is five cage, then 10 to 12 teams are going to get a shared 7.5 K, no matter like where they stand.
   310	The highest value thing you can get is support and grants for continuing to build like long after the hackathon.
   311	This, you can actually build a viable business, change the way people do business. You can be supported by canteen arc encircle to do that and scale.
   312	So the best thing that you can get is actually the grant support.
   313	After everything is over.
   314	Tammy on wise.
   315	So like some general info.
   316	You can submit existing projects, but you will be judged on the progress that you've made in these two weeks.
   317	Everything from before doesn't really count as progress.
   318	All you're going to have to do to submit is submit the public repo, make a short demo video and send a live product link. The submission form is already live I linked it here.
   319	I'm going to link this whole slide deck in in the discord.
   320	But what I, yeah, also, you know, register on Luma if you haven't, but you wouldn't be here if you haven't.
   321	Definitely join the canteen discord arc builder discord.
   322	The main commands you got to do is install the arc canteen CLI install the circle CLI. You can learn more about that in the arc one on one session that I did, it's recorded and posted on.
   323	The discord server.
   324	Definitely using the arc canteen CLI submit updates, as you go.
   325	You just do our canteen update traction or update product.
   326	And this will go a long way when judges are going through your product.
   327	I just wanted to emphasize that you should be using the arc canteen CLIs, a unique RPC key that you've gotten.
   328	Instead of the public one through that you can find on public our docs, because through that we also track traction and the progress that you made throughout two weeks.
   329	There's a bunch of educational sessions that we're going to have, as I mentioned, a one is soon after this. So also check out the events on discord to to see like everything that's available.
   330	The main links or the Tammy on websites, Tammy on the canteen app.com, the blog. Definitely the arc, the canteen arc CLI, and you know, all the docs that are available.
   331	So, without further ado,
   332	it's time to build.
   333	If you guys have any questions I'm here.
   334	If you guys would like for me to do a repeats arc one on one session I can. It's recorded you can rewatch it I can also do it live, if you'd like, let me know.
   335	And see if you guys have anything to say anything to ask.
   336	I'll wait a little bit longer.
   337	Okay.
   338	Okay, I guess you guys don't have any questions.
   339	I'm going to call it here.
   340	Feel free. Yeah, it's been clear so far. Cool.
   341	If I can help you guys out in any way. I'm just paying me on discord.
   342	Thanks a lot was struggling with ideas but now I have a few awesome. That was, that was definitely the whole point.
   343	I'm really happy to hear that cool guys. I'll see you then on discord and get a session that I have. Definitely tune in for the fireside chats because a lot of the times, it's just, it's your peers that have already built something that people are already using.
   344	It's always really cool to see like their experiences in like the problems that they've had. So, yeah.
