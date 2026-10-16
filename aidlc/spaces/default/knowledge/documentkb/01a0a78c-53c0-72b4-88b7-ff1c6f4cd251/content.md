# PoC 분석 1차 — 부록: 파일 해시 스냅샷 (2026-09-14)

본문 보고서 `CatchU_PoC_분석_1차_2026-09-14.md`의 【코드】·【검증】이 기준으로 삼은 파일이다. 해시는 SHA-256 앞 16자리. 상태는 착수 시점 git 기준(tracked-clean / tracked-modified / untracked)이며 검증 후 재대조에서 88개 모두 변경 없음을 확인했다.

- snapshot_taken_at: `2026-09-14T08:42:14Z`
- head: `698428a63893efdc68086f1ea8e44278f76853dd`
- head_date: `2026-08-23 23:53:06 +0900`
- remote: `https://github.com/ljm0850/CatchU-poc.git`
- python: `Python 3.13.7`

| 해시(16) | 바이트 | 경로 | 상태 |
|---|---:|---|---|
| `e9daa55a4c37e8d9` | 2863 | `.gitignore` | tracked-clean |
| `2bb4da7ff0173a68` | 5500 | `CLAUDE.md` | tracked-modified |
| `b50df905acc6898e` | 13504605 | `data/_sandbox/goose/commit_details.json` | tracked-clean |
| `8c9bb74154f5fac9` | 1819887 | `data/_sandbox/goose/commits.json` | tracked-clean |
| `44136fa355b3678a` | 2 | `data/_sandbox/goose/pr_commits.json` | tracked-clean |
| `4f53cda18c2baa0c` | 2 | `data/_sandbox/goose/pulls.json` | tracked-clean |
| `b5b50e644ff55820` | 61908 | `data/_sandbox/healing-play/commit_details.json` | tracked-clean |
| `489497ec6f5f71ab` | 137670 | `data/_sandbox/healing-play/commits.json` | tracked-clean |
| `44136fa355b3678a` | 2 | `data/_sandbox/healing-play/pr_commits.json` | tracked-clean |
| `4f53cda18c2baa0c` | 2 | `data/_sandbox/healing-play/pulls.json` | tracked-clean |
| `435b33bf983f89ea` | 17555 | `data/arv/commit_details.json` | tracked-clean |
| `9bf25d2fcea8a292` | 34817 | `data/arv/commits.json` | tracked-clean |
| `44136fa355b3678a` | 2 | `data/arv/pr_commits.json` | tracked-clean |
| `4f53cda18c2baa0c` | 2 | `data/arv/pulls.json` | tracked-clean |
| `30748b75ee23b2b4` | 891394 | `data/bz/commit_details.json` | tracked-clean |
| `4b56ca170d6d031e` | 1236320 | `data/bz/commits.json` | tracked-clean |
| `44136fa355b3678a` | 2 | `data/bz/pr_commits.json` | tracked-clean |
| `4f53cda18c2baa0c` | 2 | `data/bz/pulls.json` | tracked-clean |
| `d1835ed5f2704dfe` | 653925 | `data/commit_details.json` | tracked-clean |
| `1242354740c60993` | 1199446 | `data/commits.json` | tracked-clean |
| `9826c9c04bafbd9e` | 834 | `data/pr_commits.json` | tracked-clean |
| `6663b646551e4dff` | 46052 | `data/pulls.json` | tracked-clean |
| `1abf37c7632d6320` | 8202 | `docs/증거카드_이상형과_추출방법.md` | tracked-clean |
| `ee6e04d503399c42` | 14149 | `report/BODY_COLLECTION.md` | tracked-clean |
| `8b59616da2603087` | 8136 | `report/CARD_CANDIDATES_REJECTED_2026-09-03.md` | untracked |
| `1d68276540b6a02a` | 40357 | `report/CLAIM_GROUPS_2026-08-26.md` | untracked |
| `75c5cdedc486859e` | 9868 | `report/GIT_INIT_2026-08-23.md` | tracked-clean |
| `54080b3bb453230e` | 26886 | `report/REMEDIATION_2026-08-11.md` | tracked-clean |
| `27e5339443f8bd17` | 11941 | `report/REPORT.md` | tracked-clean |
| `3471f4d35daf7e38` | 52138 | `report/REPORT_BOUNDARY_LIMITS_2026-09-04.md` | untracked |
| `1e26ccf6e89d1ee7` | 15340 | `report/REPORT_DAY2.md` | tracked-clean |
| `89551754979e5d9e` | 11351 | `report/REPORT_STEP2.md` | tracked-clean |
| `22e4514c42b5e7a7` | 24681 | `report/REVISIT_PAIRS_2026-08-25.md` | untracked |
| `3422f111da96990f` | 14540 | `report/_sandbox/goose/SANDBOX_RUN_2026-08-12.md` | tracked-clean |
| `eb5faf2864943ae2` | 190802 | `report/_sandbox/goose/card_candidates.json` | tracked-clean |
| `19886e70e6ca1aaf` | 552451 | `report/_sandbox/goose/events.json` | tracked-clean |
| `f1ac55af2036e93e` | 252506 | `report/_sandbox/goose/merge_units.json` | tracked-clean |
| `a89b37b92dc4c15d` | 20769 | `report/_sandbox/goose/metrics.json` | tracked-clean |
| `f544cbd025ba963d` | 778 | `report/_sandbox/goose/threshold.json` | tracked-clean |
| `9c5597f2d1dfa2a0` | 15673 | `report/_sandbox/healing-play/SUMMARY.md` | tracked-clean |
| `b0abfb865a748f2c` | 34499 | `report/_sandbox/healing-play/events.json` | tracked-clean |
| `27097e1965150f79` | 17473 | `report/_sandbox/healing-play/merge_units.json` | tracked-clean |
| `6ef71bdbfe541687` | 14355 | `report/_sandbox/healing-play/metrics.json` | tracked-clean |
| `d748f6828ad66d5c` | 6003 | `report/_sandbox/healing-play/patterns.json` | tracked-clean |
| `c55a1bee999c2d58` | 677 | `report/_sandbox/healing-play/threshold.json` | tracked-clean |
| `7544a95f03475f19` | 6175 | `report/arv/card_candidates.json` | tracked-clean |
| `0154507b3bb3f615` | 4797 | `report/arv/dossier_B003.md` | tracked-clean |
| `09c0c2803be83926` | 15330 | `report/arv/events.json` | tracked-clean |
| `35b898576984ac40` | 1531 | `report/arv/merge_units.json` | tracked-clean |
| `ae6f19934e4044e0` | 14380 | `report/arv/metrics.json` | tracked-clean |
| `bfdb70ce6829b6bd` | 298 | `report/arv/threshold.json` | tracked-clean |
| `36f3fd279ad7f808` | 54094 | `report/boundary_limits2_2026-09-04.json` | untracked |
| `ab542e6005c3dea3` | 37256 | `report/boundary_limits3_2026-09-04.json` | untracked |
| `e71383e9854212b4` | 674779 | `report/boundary_limits_2026-09-04.json` | untracked |
| `c7eac56b6d3854dc` | 13675 | `report/bz/ADMISSION.md` | tracked-clean |
| `cdea27918dc7f270` | 12859 | `report/bz/SANDBOX_RUN_2026-08-11.md` | tracked-clean |
| `226c0b4eb83bed2e` | 108300 | `report/bz/card_candidates.json` | tracked-clean |
| `4328ad43d71fa5c0` | 340956 | `report/bz/events.json` | tracked-clean |
| `b54b3e2b03779935` | 222055 | `report/bz/merge_units.json` | tracked-clean |
| `07862a1aace05594` | 24405 | `report/bz/metrics.json` | tracked-clean |
| `fae64c644450f6d7` | 777 | `report/bz/threshold.json` | tracked-clean |
| `f15e7e455ef66274` | 139457 | `report/claim_groups.json` | untracked |
| `eb3f68a1f1d73737` | 42808 | `report/dossier_A042.md` | tracked-clean |
| `e20da999f0ae2239` | 369926 | `report/events.json` | tracked-clean |
| `414a45cb23fc5a7d` | 123840 | `report/import_graph_2026-09-04.json` | untracked |
| `5da8ce334e03794a` | 161703 | `report/merge_units.json` | tracked-clean |
| `b79c46825cd08ad3` | 20996 | `report/metrics.json` | tracked-clean |
| `811884d7933a5e29` | 2115996 | `report/revisit_pairs.json` | untracked |
| `e6ce73df03832685` | 775 | `report/threshold.json` | tracked-clean |
| `6e4a0b0a0d2ce548` | 8139 | `scripts/analyze.py` | tracked-clean |
| `fa69b5d812c17b58` | 4704 | `scripts/analyze_merge_units.py` | tracked-clean |
| `130da8989194edd6` | 5899 | `scripts/analyze_patterns.py` | tracked-clean |
| `b7a955651d94e590` | 12122 | `scripts/anonymize.py` | tracked-clean |
| `65e06835ce6e4299` | 10449 | `scripts/boundary_lib.py` | untracked |
| `62bb0c149ae49579` | 18584 | `scripts/build_dossier.py` | tracked-clean |
| `5b041dac575d3721` | 15739 | `scripts/build_events.py` | tracked-clean |
| `6050f84cc122bb7e` | 7282 | `scripts/build_import_graph.py` | untracked |
| `9b5bd9b0fe2fed31` | 3971 | `scripts/collect_api.py` | tracked-clean |
| `5e5dd7667bf9eeda` | 4589 | `scripts/collect_details.py` | tracked-clean |
| `e4f1c33c0ed555bb` | 2309 | `scripts/gap_sample.py` | tracked-clean |
| `e19f0a58528d109c` | 19866 | `scripts/gate_anonymize.py` | tracked-clean |
| `2bc29129313fcccf` | 9395 | `scripts/measure_boundary_limits.py` | untracked |
| `d9fcce66e26030d0` | 8699 | `scripts/measure_boundary_limits2.py` | untracked |
| `64b408cfab69a98f` | 5193 | `scripts/measure_boundary_limits3.py` | untracked |
| `36b525afd861207a` | 24905 | `scripts/measure_revisit_pairs.py` | untracked |
| `af58b424ceb5f1ed` | 4034 | `scripts/pick_threshold.py` | tracked-clean |
| `0523c0d4eb3490ae` | 12629 | `scripts/profile_claim_groups.py` | untracked |
| `9056908d092dfbf0` | 5417 | `scripts/select_card_candidate.py` | tracked-clean |
