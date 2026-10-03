# NYSC fixed roles

NYSC opts into `Workspace.roleBasedIdentity`. Departments remain organizational groups and can contain multiple fixed roles. Only the Director can create/edit roles and assign their mobile numbers. Phone assignments use collected `MigrationRoleContact` values; legacy Personnel/Director `phone` and `loginId` fields are dummy credentials and never become assignments.

`WorkspaceRole` gives each position a permanent ID. Existing Personnel records remain as backing records so tasks, progress, reporting relationships, comments, notifications and audit references retain their original IDs. The Chairman role links both the existing Personnel record and its Director management record. Director is its canonical authentication identity; the Personnel record is an alias with no separate login, support entry or assignment. Chairman notifications include both identities.

The migration also creates bridges for inactive/deleted backing records to preserve their histories. These are excluded from the active role directory. Other companies retain their current behavior until explicitly opted in.

## Rollout

1. Back up Taskwise and Syswise PostgreSQL databases with `pg_dump -Fc` before deploying the additive schema migration. Verify both dumps with `pg_restore --list`. Save data fingerprints server-side in a restricted directory.
2. Deploy code and the Prisma migration. The workspace flag defaults to false, so deployment alone does not enable fixed roles.
3. Run a dry run in `server`: `node dist/scripts/migrateNyscRoles.js --workspace=91397d3f-2ccb-4d7d-a7b9-5130151cbfa1`.
4. Review Chairman IDs, preserved-record count, active roles and collected contacts. The script aborts on ambiguous Chairman records or conflicting Chairman contacts.
5. Apply with the same command plus `--apply`. Role creation and flag activation are transactional. Then contacts synchronize to Syswise; pending contacts use the existing retry process.
6. Verify active role count, one Chairman in support/assignment directories, original history IDs and credentials unchanged, contact sync status and other company flags unchanged.

Role management is under **Team Hierarchy → Roles**. New roles require a name, department and reporting role where applicable, without legacy passwords or dummy numbers. Assigning a new person's phone invalidates the previous person's role sessions. Users authenticate in Syswise/Pickiti and prove their contact there; role assignment does not itself verify ownership.

## Checks

- Backend `npm run test:roles`: isolated local PostgreSQL migration and authorization checks, SSO role selection, reassignment and historical-data preservation.
- Frontend `npm run test:roles`: real browser role creation and phone assignment, country validation and digit-field cursor behavior.
- Existing backend identity and support tests plus frontend support tests cover shared login and authenticated support access.

All integration fixtures require localhost PostgreSQL and use dedicated test databases. Run backend role tests and frontend role tests sequentially because they share the role fixture database.

## Recovery

Keep both database dumps and the pre-rollout application revision. Diagnose any failure before restoring: restoring a dump discards legitimate writes made after that backup. Avoid replacing current databases merely to retry contact synchronization. The script can be re-run with unchanged Chairman names/identities without duplicating roles; contact synchronization can also be retried independently. Do not delete either Chairman backing record.
