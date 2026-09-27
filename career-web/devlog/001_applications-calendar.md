# 001 — Applications, job links, calendar

## Scope and plan (2026-09-22)
User requests URL-assisted company/job entry, submitted/test/interview statuses, past records, and a site calendar with event export. Google Calendar synchronization is explicitly excluded. Existing Google login and one-workspace storage remain compatible. C4 applies to the additive private-data migration and release; C3 to the UI and importer.

- Add `career_applications`: UUID id, owner, validated JSON details, server-maintained status history, revision, timestamps. Own-user RLS on every operation. No service role. Many applications per user; bounded paginated reads. Updates compare revisions and retain input on conflict. Archive retains past records; no permanent delete surface needed for this feature.
- Add authenticated GET/PUT application API using existing account helper, expected account header, origin guard, strict validation. Dates are real calendar dates. History is generated from saved status transitions, not accepted from clients.
- Add public job-link importer using user Gemini key in a request header and Google's URL-context tool. The app never fetches arbitrary URLs. Require retrieval success; inaccessible pages get a manual-text fallback. Import only editable suggestions; dates require user review and explicit save. No resume sent by this request.
- Add support for application form, list/status/past filters, editable events, status timeline, and saved answer text. Account changes unmount/clear private UI. Save is explicit. Picking another record or reloading asks before discarding dirty edits.
- Render month calendar and dated agenda with native date/time inputs. Export saved active events to standards-based ICS with stable IDs, escaped text, all-day exclusive end date, UTC timed events converted from Asia/Seoul. Archived records remain accessible but leave active calendar.
- Reuse existing typography/colors, native JS/Intl and current dependencies. No calendar SDK or synchronization permission.

## Audit and verification gates
Independent audit before release: owner isolation, account switches, CAS conflict, importer inaccessible/injected response, no key persistence, bounded input, date and ICS correctness. Meaningful unit tests plus type/build. Apply additive migration in Supabase dashboard and verify RLS in rolled-back test transaction. Browser exercise authenticated create/update/reload/archive/restore, calendar+ICS, responsive layout. Do not remove real records or expose secrets. New test records are clearly identified and archived after testing unless deletion approved.

## Release
Push only career-web and scoped docs to existing branch, then Vercel CLI production deploy. Production smoke tests on alias. Rollback UI deployment to prior dpl_7mzsCKt4KTj2xMYXDWpT6CDLZ1pg leaves additive table intact. No live Gemini claim without a valid user key. Evidence to be appended after checks.

## Verification — 2026-09-23 / resumed 2026-09-27
- Independent backend review found two issues: stale job/company attachments crossing companies, and imported deadlines overwriting customized events. Both fixed: candidate/example attachments retained; old company/job attachments removed with clear confirmation; existing deadline preserved and extracted date shown in notice.
- Additive migration applied through Supabase SQL Editor; relrowsecurity=true observed. Rolled-back two-user transaction verified own read and other-user read/update/insert isolation. No real records modified by SQL verification.
- Local real Google account: created explicitly synthetic record, saved submitted→test transition; status history showed both entries. Date 2026-09-28 09:30 persisted, calendar showed the same time after page reload and explicit load. Archived record appeared in archived filter. Synthetic record remains archived, no real resume used.
- Browser screenshots inspected desktop, 390px and 320px. No horizontal overflow (scrollWidth375/305 respectively). Calendar date selection and details working. Viewport reset.
- ICS native download link contains validated UTF-8 calendar with UTC 20260928T003000Z for Korean09:30 and download filename. In-app browser did not report a download event, so disk-save completion is unverified; file-content/escaping/date tests pass. No external calendar connected.
- Official Gemini Interactions API schema checked: https://ai.google.dev/api/interactions-api ; URL context guidance https://ai.google.dev/gemini-api/docs/url-context . Mock tests cover retrieval failure, missing metadata, output bounds, key-only-header, fixed upstream URL and store:false. Live Gemini retrieval remains unverified without user API key.
- 26 automated checks passed on 2026-09-27. Production build pending final result below.
- Recall CLI unavailable in PATH; resumed from checked repository files and current conversation evidence. Reviewer ended on usage limit after reporting findings; main fixed and verified those findings.
- Final production build passed (2026-09-27). Source commit 58e65fb pushed to origin/codex/career-note-web. CLI60.1.3 returned Not authorized despite valid whoami; previously working CLI59.25.0 successfully deployed dpl_BC6x2bT8uAF7dwULERosjMVLQ3RY, READY and aliased to https://career-note-haesolii.vercel.app . Public smoke: root/privacy200, account200 private/no-store, unauthenticated applications401 private/no-store.
- Production browser authenticated session successfully loaded the archived synthetic application, including submitted date and test status. Feature is deployed; live Gemini call and in-app browser physical file saving remain the stated validation limits.
