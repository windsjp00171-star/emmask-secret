---
target: emmask-secret Dashboard (main)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/emmask-secret/public/index.html"
target_fingerprint: "sha256:74833f1e7b0e2371733935205a06621a2f2ec1170fe42654655715b34575fd1e"
target_path: /home/user/emmask-secret/public/index.html
timestamp: 2026-11-21T13-59-12Z
slug: public-index-html
---
Method: dual-agent (A: design review · B: detector/browser), target = origin/main 830f24c

## Design Health Score: 27/40 (Good)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | System status | 3 | 更新時間 hidden on mobile |
| 2 | Real-world match | 3 | 專案更新 / 提醒 vs 待辦 leak internal model; login says Dashboard |
| 3 | User control | 3 | 復原 on tick/delete; 回總覽 small, top only |
| 4 | Consistency | 2 | Card view has no type avatars, list view does; two separate view toggles; bucket pills shown in 已完成 |
| 5 | Error prevention | 3 | Double-tap and scroll guards; delete next to cancel (undoable) |
| 6 | Recognition | 3 | Shortcut hints only in placeholders |
| 7 | Flexibility | 3 | Shortcuts and batch exist; no tick/move/edit keys |
| 8 | Minimalist | 2 | ~5 control rows (~240px) before first task on mobile |
| 9 | Error recovery | 2 | Toggle on unmatched id fails silently |
| 10 | Help | 3 | 8-step tour; mobile ? unlabeled 36px |

## Priority issues
- [P1] No 小秘書 presence on phone or login: add one-line greeting with mascot + computed sentence; mascot + warm copy on login. delight, bolder
- [P1] Cards lost chat-row identity and every card looks the same: type avatars in .citem, temperature per bucket. colorize, typeset
- [P1] Too much control chrome before content on mobile: merge 列表/日曆 and 列表檢視/卡片檢視 into one control, fold chips, move 已完成. distill, layout
- [P2] Composer + opens full 5-field form: chip tray instead. clarify
- [P2] Silent failure on id mismatch (=== on ids at index.html:1293,1540...); tabs lack aria-selected; .check 36px; today count badge 4.31:1. harden, audit

## Detector
CLI 5: broken-image lightboxImg (FP), bulkBar border+shadow (documented), #000 mask stop (FP), radius 22px (index.html:113) and 3px (:204) drift. Overlay: same bulkBar + low-contrast .cgroup.today .cnum #04833a on #e2f6e9 4.3:1 (light only). a11y names/alt OK.
