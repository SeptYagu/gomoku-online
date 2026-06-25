# 2026-06-25 Parallel vs Single Random Opening Arena

## Command

```bash
npm run arena -- --games 20 --candidate current-parallel --baseline 09ea4e5 --difficulty insane --random-openings 2 --time-limit-ms 250 --output .arena-results/parallel-vs-single-09ea4e5-20-insane-random2-250ms.json
```

## Configuration

- Candidate: `current-parallel`
- Baseline: `09ea4e5`
- Difficulty profile: `insane`
- Random opening plies: 2
- Per-move arena time cap: 250ms
- Games: 20
- Output JSON: `.arena-results/parallel-vs-single-09ea4e5-20-insane-random2-250ms.json`

This is a fast sampling run, not a full 30s-per-move insane match. A full-budget random-opening run was stopped after 20 minutes without producing a completed report.

## Result

- Candidate wins: 14
- Baseline wins: 3
- Draws: 3
- Candidate win rate: 70.0%
- Baseline win rate: 15.0%
- Draw rate: 15.0%
- Average moves: 77.4
- Average duration: 37041.65ms/game

## Game Results

| Game | Result | Moves | Duration |
| --- | --- | ---: | ---: |
| 1 | draw | 225 | 121549ms |
| 2 | candidate won | 36 | 15563ms |
| 3 | candidate won | 21 | 6434ms |
| 4 | baseline won | 13 | 318ms |
| 5 | draw | 225 | 123641ms |
| 6 | candidate won | 62 | 24330ms |
| 7 | candidate won | 25 | 11381ms |
| 8 | candidate won | 64 | 23220ms |
| 9 | baseline won | 58 | 25845ms |
| 10 | baseline won | 35 | 12858ms |
| 11 | candidate won | 19 | 6279ms |
| 12 | draw | 225 | 125608ms |
| 13 | candidate won | 55 | 26507ms |
| 14 | candidate won | 58 | 25843ms |
| 15 | candidate won | 97 | 48714ms |
| 16 | candidate won | 58 | 25739ms |
| 17 | candidate won | 87 | 39700ms |
| 18 | candidate won | 118 | 52997ms |
| 19 | candidate won | 35 | 14315ms |
| 20 | candidate won | 32 | 9992ms |

## Top Winning Openings

```text
2 wins (1 candidate / 1 baseline): b-2:-1|w0:-2|b-1:-1|w0:-1|b0:0|w-2:-2|b-1:-2|w-1:0
1 wins (1 candidate / 0 baseline): b-1:-1|w0:-2|b-2:-2|w0:0|b0:-1|w1:-1|b-1:-3|w-1:1
1 wins (1 candidate / 0 baseline): b-1:-1|w1:-2|b0:-1|w1:-1|b1:0|w-1:-2|b0:-2|w0:0
1 wins (1 candidate / 0 baseline): b-1:-1|w1:1|b-1:0|w-1:1|b0:1|w1:2|b1:0|w0:0
1 wins (1 candidate / 0 baseline): b-1:1|w-1:-1|b0:0|w1:-1|b0:-1|w0:-2|b-2:0|w2:0
```
