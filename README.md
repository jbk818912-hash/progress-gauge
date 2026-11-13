# progress-gauge

Claude Code 모드입니다. Claude가 여러 단계로 작업하는 동안, 채팅 입력창 바로 위에 지금 어떤 단계를 하고 있는지와 전체 진행도를 게이지 바로 보여줍니다.

```
🎬 작업 진행도  ██████░░░░░░░░░░░░  29%  (2/7)
▶ 지금: 3단계 · 자막 넣기   · 다음: 효과음 배치   [접기]
```

- Claude가 원래 쓰는 작업 목록을 읽기만 하므로, 모델 토큰은 더 들지 않습니다.
- 모든 단계가 끝나면 `✅ 작업 완료 100%`로 바뀌고 완료 효과음(`sounds/done.wav`)이 한 번 울립니다.
- **접기**를 누르면 한 줄 요약으로 줄고, **펼치기**나 새 작업 시작 시 다시 펼쳐집니다.
- Claude 데스크톱 앱과 터미널 모두에서 동작합니다. 효과음은 Windows와 Mac에서 납니다.

## 설치

아래 셋 중 편한 방법 하나만 하면 됩니다.

**① 셸(명령 프롬프트, PowerShell, 터미널)에서**

```bash
claude plugin install progress-gauge --marketplace jbk818912-hash/progress-gauge
```

**② 터미널의 Claude Code 프롬프트에서**

```
/plugin install progress-gauge --marketplace jbk818912-hash/progress-gauge
```

`Add marketplace?`가 나오면 `y`, 설치 범위는 그대로 Enter를 누르면 됩니다.

**③ Claude 데스크톱 앱에서**

프롬프트 창 옆 **+** → **Plugins** → **Add marketplace**에 `jbk818912-hash/progress-gauge` 입력 → **Add plugin**에서 `progress-gauge` 추가.

> 설치 후에는 **새로 여는 세션**부터 적용됩니다. 이미 열려 있던 세션은 앱(또는 Claude Code)을 완전히 종료했다가 다시 켜 주세요.

## 사용

따로 할 일은 없습니다. Claude에게 여러 단계짜리 작업을 맡기면 게이지가 자동으로 나타납니다.

## 끄기 · 지우기

```bash
claude plugin disable progress-gauge@progress-gauge-marketplace
```

```bash
claude plugin uninstall progress-gauge@progress-gauge-marketplace
```

## 효과음 바꾸기

기본 효과음은 이 모드를 위해 새로 만든 벨 소리입니다.

설치된 폴더의 `sounds/done.wav`를 원하는 WAV 파일로 바꾸면 됩니다. (Windows는 MP3를 재생하지 못하니 WAV로 변환해서 넣어 주세요.) 플러그인을 업데이트하면 원래 소리로 돌아갈 수 있으니, 바꾼 파일은 따로 보관해 두세요.
