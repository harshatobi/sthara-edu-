# Verification record — 21 September 2026

- `npm test`: 24 passing tests. Includes all supplied Privacy/DPDP section IDs and substantive paragraph/list/table text, mocked enquiry API states, and Vercel production approval gates.
- `npm run verify`: 9 pages, 602 local references, metadata, navigation, Contact integration and three byte-identical original Astra artwork assets. JavaScript syntax checks pass.
- Standalone exporter: embeds assets and scripts, validates syntax and internal company links. Routing mocks cover company pages, deep anchors, roles, Home, active links and the file-mode email fallback.
- Initial localhost homepage rendering and controls were inspected through the browser DOM. Further visual, mobile and interaction checks were blocked by the browser tool's account usage-limit rejection. These are not claimed as completed.
- No live enquiry was sent. Provider traffic in tests is mocked. Email delivery requires configured Resend/Turnstile and a deployed end-to-end inbox check.
- No deployment, domain change, school-app edit, source-file overwrite or original Astra export replacement was performed.

The complete supplied policies were migrated, not independently legally approved. Confirm their current accuracy and the hosting/routing plan before public release; see README.md.
