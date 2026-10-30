# CRM 맞춤 제안 대상 분석

아크릴 전시회 CRM의 접점 CSV를 읽어, 관심·업무 요구·후속 요청을 라벨링하고 맞춤 제안 후보를 검토하는 웹앱입니다. 구매 확률은 계산하지 않습니다.

라벨링은 공식 [Google Gen AI JavaScript SDK](https://github.com/googleapis/js-genai)(`@google/genai`)로 서버에서만 호출합니다. 구조화 출력은 `responseMimeType: "application/json"`과 `responseJsonSchema`를 사용합니다. 공식 문서의 구조화 출력 예시는 `gemini-3.8-flash`를 사용합니다. 앱은 이 모델 ID를 코드에 고정하지 않고 `GEMINI_MODEL` 환경변수만 읽습니다.

구조화 출력은 응답 형식을 맞추는 데 도움이 될 뿐, 라벨의 의미가 맞다는 보장은 아닙니다. 화면의 근거 인용을 함께 확인하세요.

## 실행

```bash
npm install
npm run dev
```

개발 서버는 `http://localhost:3000` 입니다.

```bash
npm test
npm run build
```

## 환경변수

`.env.example`을 복사해 `.env.local`을 만듭니다. 키에는 `NEXT_PUBLIC_`를 붙이지 않습니다.

```bash
GEMINI_API_KEY=발급받은 키
GEMINI_MODEL=gemini-3.8-flash
```

값을 바꾼 뒤에는 개발 서버를 다시 시작합니다. 이 앱은 무료 할당량이나 무제한 실행을 보장하지 않습니다. 호출량과 요금은 Google AI 계정의 한도를 따릅니다.

## 사용 순서

1. UTF-8 CSV를 올립니다. Excel에서는 **CSV UTF-8(쉼표로 분리)** 로 저장합니다.
2. 접점 수, 고유 고객 수, 빈칸, 필수 열, 접점ID 오류, 앞 10행을 확인합니다.
3. 전체 라벨링을 시작합니다. 접점ID와 분석 필드만 Gemini API로 전송됩니다.
4. 등급, 근거, 추가 질문을 검토하고 접점을 선택합니다.
5. 전체 결과 또는 선택한 후보를 CSV나 JSON으로 받습니다.

세그먼트 외 분석 필드가 모두 빈 행은 API를 호출하지 않고 `규칙: 정보 없음`으로 처리합니다.

## 공개 배포 전

이 저장소의 개발 서버는 인증과 호출 제한이 없습니다. 인터넷에 공개하기 전에는 로그인과 요청 속도 제한을 넣어야 합니다. API 키는 서버 환경변수로만 두고, 원본 CRM 파일은 저장소에 커밋하지 않습니다.
