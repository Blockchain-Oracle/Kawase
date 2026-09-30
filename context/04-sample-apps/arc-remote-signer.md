# arc-remote-signer
Go gRPC sidecar ("Nitro Enclave Signer") that holds an Arc **validator consensus key** (Ed25519 default, BLS12-381 optional) inside an AWS Nitro Enclave and returns raw signatures to the Malachite consensus node; keys are envelope-encrypted (AES-GCM data key -> AWS KMS with PCR0 attestation policy -> Secrets Manager).
Sources: https://github.com/circlefin/arc-remote-signer, refs/circlefin/arc-remote-signer @ a9e9fdb, no dedicated Arc docs page (Malachite consensus context: https://docs.arc.io/arc/concepts/consensus-layer)
Verified: 2026-09-29

## 1. What it does
- Runs as a 1-to-1 sidecar next to an Arc validator node; the validator (Malachite) calls `SignerService.Sign(message)` over gRPC port 10340 (`configs/app.yaml` comment "tls secures the malachite -> sidecar gRPC connection").
- On startup the Proxy loads the key from AWS Secrets Manager; if the secret is empty it asks KMS for a data key and asks the Enclave to generate a new keypair, then stores the encrypted blob back (`internal/app/service/signer/signer.go:84-152`).
- Proxy forwards signing to the Enclave over vsock (CID 16, port 10350); Enclave decrypts the data key with its attestation-bound KMS response, decrypts the private key with AES-GCM, signs, returns only the signature (`internal/enclave/service/enclave/enclave.go:135-236`).
- KMS `Decrypt`/`GenerateDataKey` are called with a `Recipient` (attestation document) so KMS re-encrypts to the enclave's key; key policy pins `kms:RecipientAttestation:ImageSha384` = PCR0 (`internal/app/provider/awskms/awskms.go:118-164`, `docs/architecture.md` "AWS KMS key").
- Reproducible enclave image build (digest-pinned bases, snapshot-pinned apt) so PCR0 is stable (README "Reproducible Enclave Builds", `make test-reproducibility`).

## 2. RFB fit
- **RFB4 Autonomous Business Operator — conceptual only.** It is the reference for "agent authority that the host/operator cannot steal": hardware-isolated key + attestation-gated KMS. But it signs arbitrary bytes with **Ed25519/BLS only** — there is **no secp256k1/ECDSA, no EVM transaction building, no policy engine, no spending limits** (grep for secp256k1/ecdsa/keccak returns nothing; algorithms defined at `internal/common/crypto/algorithm.go:22-24`). It cannot sign an Arc USDC transfer as-is.
- Could be pitched as: "agent's signing key lives in an enclave; the enclave could enforce policy (limits, allowlists) before signing" — that policy layer would be new code inside `enclave.SignMessage`.
- Secondary RFB5/RFB2: none directly.
- For a hackathon, **on-chain** limits (smart-contract wallet / spending-policy contract) or Circle Dev-Controlled Wallets with policies are far faster than Nitro Enclaves. Cite this repo as "production-grade key custody pattern Circle uses for Arc validators".

## 3. Tech stack + versions
- Go `1.25.0` (`go.mod`), module `github.com/circlefin/arc-remote-signer`.
- gRPC `google.golang.org/grpc v1.79.3`, protovalidate `buf.build/go/protovalidate v1.1.3`, buf codegen (`proto/buf.gen.yaml`).
- AWS: `aws-sdk-go-v2/config v1.29.16`, `service/kms v1.41.0`, `service/secretsmanager v1.35.6`.
- Enclave: `github.com/edgebitio/nitro-enclaves-sdk-go v1.0.0`, `github.com/hf/nsm` (indirect), `github.com/mdlayher/vsock v1.2.1`.
- Crypto: `github.com/supranational/blst v0.3.14` (BLS; cgo, with `bls_nocgo.go` stub), stdlib ed25519, AES-GCM.
- Config/CLI: `spf13/cobra v1.9.1`, `spf13/viper v1.21.0` (env prefix `APP_`).
- Observability: OpenTelemetry `v1.43.0`, DataDog `datadog-go/v5 v5.8.1`, Prometheus `client_golang v1.23.2`.
- Dev: Docker + Docker Compose, LocalStack 3 (KMS + Secrets Manager emulation), Make, pre-commit, golangci (`build/golangci.yaml`).

## 4. Architecture
- `refs/circlefin/arc-remote-signer/main.go`, `cmd/cmd.go`, `cmd/run.go`, `cmd/run_enclave.go` — cobra entry: `run` (proxy) and `run-enclave`.
- `refs/circlefin/arc-remote-signer/proto/arc/signer/v1/signer.proto` — public API: `PublicKey()`, `Sign(bytes message) -> bytes signature`.
- `refs/circlefin/arc-remote-signer/proto/arc/enclave/v1/enclave.proto` — internal API: `GenerateKey`, `GetPublicKey`, `SignMessage`, `GetAttestation`; `Algorithm` enum BLS=1, ED25519=2 (:16-19).
- `refs/circlefin/arc-remote-signer/internal/app/app.go` — proxy wiring.
- `refs/circlefin/arc-remote-signer/internal/app/service/signer/signer.go` — key init/generate/load (:84-189), `PublicKey` (:192), `Sign` (:205-237).
- `refs/circlefin/arc-remote-signer/internal/app/service/signer/crypto.go` — binary header {CipherKey, CipherData, Nonce} stored in Secrets Manager.
- `refs/circlefin/arc-remote-signer/internal/app/provider/awskms/awskms.go` — multi-region KMS with failover; `Decrypt` (:118), `GenerateDataKey` AES_256 with `Recipient` (:144).
- `refs/circlefin/arc-remote-signer/internal/app/provider/secrets/secrets.go` — Secrets Manager get/update.
- `refs/circlefin/arc-remote-signer/internal/app/provider/enclave/transport_vsock.go` — gRPC-over-vsock client (stub for non-Linux).
- `refs/circlefin/arc-remote-signer/internal/enclave/service/enclave/enclave.go` — in-enclave handlers: `GetAttestation` (:51), `GenerateKey` (:61), `GetPublicKey` (:113), `SignMessage` (:135), data-key unwrap (:169-200), AES-GCM key decrypt + cache (:202-236).
- `refs/circlefin/arc-remote-signer/internal/enclave/provider/enclave/enclave.go` — NSM attestation doc (:43) and `DecryptKMSEnvelopedKey` (:54).
- `refs/circlefin/arc-remote-signer/internal/enclave/common/crypto/{ed25519,bls,aes}/` — key impls.
- `refs/circlefin/arc-remote-signer/internal/common/` — grpc server/client (TLS option `grpc/server/option.go:86`), interceptors (logging, metrics, recovery, request-id), telemetry, lifecycle, config loader.
- `refs/circlefin/arc-remote-signer/docker/` — `Dockerfile`, `Dockerfile.enclave` (reproducible), `run_proxy.sh`, `run_enclave.sh`, `run_enclave.dev.sh`.
- `refs/circlefin/arc-remote-signer/deployments/docker-compose.yaml` + `localstack_scripts/` — local stack (creates KMS keys + secret).
- `refs/circlefin/arc-remote-signer/docs/architecture.md` — flows, security model, AWS IAM/KMS policy, config reference.

## 5. Circle products/SDKs used
| product | package/API | where | what |
|---|---|---|---|
| Arc validator infra (Malachite consensus) | own gRPC `arc.signer.v1.SignerService` | `refs/circlefin/arc-remote-signer/proto/arc/signer/v1/signer.proto` | Signs consensus messages for Arc validators |
| none of: Wallets, CCTP, App Kit, Gateway, x402, USYC, Compliance | — | — | Pure infra; no Circle SDKs or APIs |

External: AWS KMS (`internal/app/provider/awskms/awskms.go:118-164`), AWS Secrets Manager (`internal/app/provider/secrets/secrets.go`), AWS Nitro NSM attestation (`internal/enclave/provider/enclave/enclave.go:43`).

## 6. Env vars (names only; Viper, prefix `APP_`, from `docs/architecture.md` "Configuration", `configs/.env.dev`, `deployments/docker-compose.yaml`)
`APP_ENV`, `APP_PROVIDER_AWSKMS_ARNS`, `APP_PROVIDER_AWSKMS_LOCALSTACK_ENABLED`, `APP_PROVIDER_AWSKMS_LOCALSTACK_ENDPOINT`, `APP_PROVIDER_AWSKMS_LOCALSTACK_REGION`, `APP_PROVIDER_SECRETS_LOCALSTACK_ENABLED`, `APP_PROVIDER_SECRETS_LOCALSTACK_REGION`, `APP_SERVICE_SIGNER_KEYID`, `APP_PROVIDER_ENCLAVE_NITROENCLAVE_ENABLED`, `APP_PROVIDER_ENCLAVE_NITROENCLAVE_CID`, `APP_PROVIDER_ENCLAVE_NITROENCLAVE_PORT`, `APP_NITROENCLAVE_ENABLED`, `APP_PUBLIC_SERVER_PORT`, `APP_PROFILER_ENABLED`, `APP_OTLP_ENDPOINT`, `APP_METRICS_PROMETHEUS_{ENABLED,HOST,PORT,PATH}`, `USE_LOCALSTACK`, `AWS_PROFILE`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `DD_AGENT_HOST`, `DD_SERVICE`, `DD_ENV`. Config files: `configs/app.yaml` (proxy: port 10340, `service.signer.algorithm: ed25519`, enclave client `localhost:10350`, 500 ms timeout), `configs/enclave.yaml` (port 10350, `nitroEnclave.enabled: true`).

## 7. How to run
```bash
brew install go pre-commit && pre-commit install
make dev        # builds binary + local enclave docker image, starts LocalStack (KMS+Secrets) and enclave (non-Nitro mode)
make smoke      # smoke tests against the running stack
make test       # unit tests + lint;  make test-it  (integration);  make test-reproducibility
make down
```
Production: Nitro-enabled EC2, `nitro-cli build-enclave` to get PCR0, symmetric (multi-region) KMS key with `kms:RecipientAttestation:ImageSha384` condition, Secrets Manager secret for the key, IAM role on host (docs/architecture.md "AWS Prerequisites").

## 8. Smart contracts
None. No Arc chain id/RPC/USDC addresses in code.

## 9. AI/LLM usage
None.

## 10. Reusable for a hackathon entry
- **Pitch/security narrative for RFB4**: cite the envelope-encryption + attestation chain (`docs/architecture.md` "Security Model"/"Attestation and KMS Integration") as the path to production-grade agent key custody: "agent key never leaves an attested enclave; KMS releases it only to enclave image PCR0 X".
- **Policy-before-sign hook**: the single choke point is `internal/enclave/service/enclave/enclave.go:135` `SignMessage` — a policy check (amount cap, recipient allowlist, daily budget) inserted here would be enforced inside the TEE. You'd also need a secp256k1 key type + EIP-1559/EIP-712 hashing to sign Arc (EVM) txs — not provided.
- **Simple signer interface**: `SignerService { PublicKey(); Sign(bytes) }` (`proto/arc/signer/v1/signer.proto`) is a clean abstraction to mirror in a TS agent ("Signer" interface backed by Circle Dev-Controlled Wallets now, enclave later).
- **KMS multi-region failover** helper (`internal/app/provider/awskms/awskms.go:88-116`) if you do touch AWS KMS.
- Realistically: **do not deploy this in a 2-week hackathon**; use Circle Dev-Controlled Wallets (MPC custody) or a smart-contract wallet with on-chain limits for RFB4.

## 11. Limitations / gotchas
- Validator-consensus signer only: Ed25519/BLS over raw bytes; **cannot sign EVM transactions** (no secp256k1, no RLP/EIP-712).
- No authN/authZ on the public gRPC API; TLS disabled by default (`configs/app.yaml` `tls.enabled: false`); designed for a trusted sidecar network. Anyone who can reach port 10340 can get signatures.
- No signing policy, rate limit, or slashing-protection logic (double-sign protection presumably lives in the validator/Malachite).
- Real security requires AWS Nitro-enabled EC2 + KMS + Secrets Manager + IAM; local `make dev` runs with `nitroEnclave.enabled=false` and LocalStack (no real isolation; plaintext data key passed in dev, see `signer.go:101-105` comment).
- Single key per instance (`service.signer.keyId`), 1-to-1 sidecar.
- Go 1.25 + cgo for blst; macOS builds use a no-cgo BLS stub.
- Code notes duplicated helpers "temporary" pending removal of an older HTTP key service (`enclave.go` comment above `buildCacheKey`).
