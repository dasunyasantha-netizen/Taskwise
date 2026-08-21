# TaskWise launcher integration

TaskWise implements the canonical Pickiti/SysWise return-navigation contract in
`src/services/launchSource.ts`; both director and personnel dashboards consume it.

The authoritative checklist for changes and new apps is:
[`docs/pickiti/new-app-integration.md`](https://github.com/dasunyasantha-netizen/Syswise/blob/main/docs/pickiti/new-app-integration.md).

Do not replace the resolver with a hard-coded `/`, `/apps` or `/pickiti` link.
