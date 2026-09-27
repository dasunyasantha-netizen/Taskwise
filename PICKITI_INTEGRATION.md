# TaskWise launcher integration

TaskWise implements the canonical Pickiti/SysWise **return-navigation** contract
(`pickiti-launcher-protocol` **1.0.0**) in `src/services/launchSource.ts`; both director and
personnel dashboards consume it. Contract JSON:
`.syswise/api-contracts/pickiti-launcher-protocol.v1.json`.

TaskWise is a **direct-route** app at `/taskwise/`. There is **no** live Syswise JWT SSO
exchange (`/sso?token=…`) in this repo — local login / WebAuthn only. Query params
`source` (`pickiti`|`syswise`) and allow-listed `launcher_origin` drive Back-to-launcher
links (`/pickiti` vs `/apps`).

The authoritative checklist for changes and new apps is:
[`docs/pickiti/new-app-integration.md`](https://github.com/dasunyasantha-netizen/Syswise/blob/main/docs/pickiti/new-app-integration.md).

Do not replace the resolver with a hard-coded `/`, `/apps` or `/pickiti` link.
