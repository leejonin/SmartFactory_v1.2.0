# SW_Browser_Robot_001 개념

- 기능 ID: SW_Browser_Robot_001
- 개념명: 협동로봇 집기·놓기 출하 공정
- 지시자: 이종인 / 작업자: Claude Opus 5.5 (Claude)
- 작성·수정: 2026-11-10 18:22:00 KST
- 관련 개념: SW_Browser_Logistics_001(같은 유입·합류·QR 판독). AGV 운반 단계만 로봇 + 출하 컨베이어로 바꾼다.

`b`는 상자, `read(b)`는 QR 판독 목적지, `k`는 로봇·출하 컨베이어·탑차 번호(0~2), `R[k]`는 로봇 k, `q`는 관절각 6개, `FK(q)`는 공구 끝 위치, `S`는 표시 배율 2.2다.

```text
state(b) = waiting                          => state(b) := post, dock(b) := index(read(b))
state(b) = post, x(b) = pickX(dock(b))      => state(b) := pickwait
R[k] idle, exists b: pickwait, dock(b) = k  => R[k] 집기 시작(한 번에 상자 1개)
R[k] grip 끝                                => state(b) := carried, pos(b) = S·FK(q) - 반높이
R[k] release 끝                             => state(b) := lane, s(b) := 0
state(b) = lane, s(b) >= laneLength(k)      => delivered[k] += 1, b 제거
forall b with dock(b): dock(b) = index(destination(b))   (테스트로 확인)
created = sum(delivered) + |active|                         (테스트로 확인)
```
