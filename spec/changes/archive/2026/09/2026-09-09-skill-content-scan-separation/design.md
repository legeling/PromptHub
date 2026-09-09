# Design

- **DES-SCS-001:** Remove content-review calls and authorization retries from desktop
  package staging and renderer install/update flows. Remove CLI secret assessment
  from copy, snapshot, import and distribution. Keep the independent path/archive/
  capacity/atomicity checks. Legacy request fields become inert compatibility inputs.
- **DES-SCS-002:** Persist a new disabled-by-default standalone enable flag and a
  static/AI method selection. Retire automatic/channel/trust controls. Centralize
  renderer explicit-scan dispatch so disabled scans fail before IPC; request opt-in
  is also checked at the scanning API. Old settings are normalized to inactive state.
- **DES-SCS-003:** Share deterministic content rules across desktop, Web and CLI.
  Remove source DNS, host allowlists, provenance findings and marketplace audit hints
  from the scanner and AI prompt. Keep model transport protection in the AI client,
  not in content/source classification. Use existing bounded content/file adapters;
  reports do not mutate business state or start installations.
- **DES-SCS-004:** Regression coverage separates content assessment from storage
  safety. Real package fixtures include flagged text, binary and above-old-scan-limit
  files; malformed paths still fail. Preserve other dirty work and use disposable
  filesystem/SQLite fixtures. No GUI control or live provider access is authorized.

Complexity: business operations lose redundant scans and DNS/AI requests. Standalone
static work remains O(files + bytes) within existing package limits; AI prompt work
is bounded and uses the existing finite request transport. No dependency is added.

Taxonomy: SDT-005 policy-boundary misclassification, SDT-001 divergent state ownership
and SDT-003 snapshot fidelity affected by unrelated assessment limits.

Analyze: the user explicitly replaced the earlier mandatory-content-review design.
No unresolved source-of-truth conflict remains. Package fingerprints still describe
data identity and recovery; they no longer authorize content-safety verdicts.
