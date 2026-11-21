---
target: emmask-secret Dashboard
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/emmask-secret/public/index.html"
target_fingerprint: "sha256:5f23be9286be0700b5e6fdee87c9dbb4353143e80d65aa25884b4c4283103fe7"
target_path: /home/user/emmask-secret/public/index.html
timestamp: 2026-11-21T04-59-06Z
slug: public-index-html
---
Method: dual-agent (A: design review · B: detector/browser)

## Design Health Score: 24/40 (Acceptable)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | System status | 3 | 60s auto-refresh silent; failed tick silently reverts |
| 2 | Real-world match | 3 | Notes/project updates get completion circles; login says "Dashboard" |
| 3 | User control | 2 | Tick and delete have no undo; delete uses confirm() |
| 4 | Consistency | 3 | Grabber shown on desktop dialog; 未完成 duplicated in header and tab |
| 5 | Error prevention | 2 | One-tap irreversible complete; composer forces manual type |
| 6 | Recognition | 3 | Chips have no counts |
| 7 | Flexibility | 1 | No shortcuts, no batch actions despite desktop batch-tidy use case |
| 8 | Minimalist | 3 | Repeated identical avatars; three stacked header bands |
| 9 | Error recovery | 2 | Raw server error string in 2.4s toast |
| 10 | Help | 2 | No guidance beyond empty state |

## Priority issues
- [P1] Avatar column carries no information (6/8 rows same grey list icon) -> project monogram avatar, type as corner glyph. colorize, polish
- [P1] No 小秘書 voice / AI trace / 服事 -> one-line voice summary, pinned 本週服事 row, warm clear-state. clarify, delight
- [P1] main#list aria-live="polite" re-announces whole list on every render/refresh/keystroke; tabs lack keyboard semantics; dialog no focus trap/restore. harden
- [P2] No undo for tick/delete -> undo toast 5s, replace confirm(). harden
- [P2] No shortcuts/batch; chips overflow 760px column unreachable by mouse. layout, harden

## Detector
CLI: 2 advisory (14px off type ramp at index.html:41-42 & app.css:71; radius 20px instead of pill token at :42-43). Overlay desktop: cramped-padding on .app (false positive, intentional column divider). Mobile clean. a11y names/alt OK.
