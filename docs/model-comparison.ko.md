# Spark 1.3과 Spark Open

[← README](../README.ko.md) · [English](model-comparison.md)

모델마다 맡은 일이 하나씩 있어요. 숫자는 절대 모델이 만들지 않아요.

| 모델 | 제품에서 맡은 일 | 상태 |
|---|---|---|
| **Muse Spark 1.3** | 가족의 일상 선택과 이유, 상담 에이전트, 그리고 이 레포를 작성한 코딩 에이전트(Muse Code) | 완료 |
| **Muse Spark Open** (Baseten의 `meta-models/muse-spark-open-1026`) | 오픈 웨이트 모델로 같은 가족 판단을 해요. 스위치 하나로 바꿔요(`--provider meta\|baseten`). 아래에 Spark 1.3과 비교했어요 | 완료(비교) |
| **판정자 역할의 Muse Spark 1.3** | 리포트 문장과 그 문장이 인용한 시뮬레이션 기록을 나란히 읽고, 뒷받침하는지와 이유를 답해요. 리포트를 쓰는 호출과는 따로 불러요 | 완료 |
| **Muse Voice Transcribe 1.0** | 말로 시작하기: 마이크를 누르고 가족과 직장을 말하면 받아 적은 글이 입력창에 들어가요. 저절로 보내지는 않아요 | 완료 |
| SAM 3.1 | 매물 사진과 도면에서 방 크기와 창 면적을 재요 | *준비 중* |

**같은 가족으로 비교한 Spark 1.3과 Spark Open**(2026-10-29, `reasoning_effort` low, 파일은 [`scenarios/decisions/compare-1029/`](../scenarios/decisions/compare-1029/)):

| | Spark 1.3 | Spark Open |
|---|---|---|
| 판단 수(A + B) | 154번, 모두 답함, 검사 탈락 0 | 154번, 모두 답함, 검사 탈락 0 |
| 같은 판단 지점에서 같은 선택 | 139번 중 120번(86%) | |
| 규칙 기본값과 다른 선택(154번 중) | 75 | 72 |
| 호출당 평균 응답 시간 | 3.7초 | 2.7초 |
| 출력 토큰(A + B) | 14만 | 9.6만 |

둘이 다르게 고른 곳은 대부분 퇴근길에 어느 가게에 들를지였어요(19번 중 15번). 생각 길이를 제한하지 않으면 Spark Open은 154번 중 116번에서 2,000토큰을 생각하는 데 다 써 버렸어요. `reasoning_effort: low`로 두니 모두 답했어요.
