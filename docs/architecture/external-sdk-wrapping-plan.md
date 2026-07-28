# PLUS 외부 SDK React Native 제공 계획

## 상태와 목적

이 문서는 `~/Dev/Plus`에서 사용 중인 외부 SDK를 AllNewMTS의 React Native 제품 기능에 제공하기 위한 구현 전 계획이다. 아직 공개 API, 제품 범위, SDK 채택 또는 바이너리 반입을 승인하는 계약은 아니다.

구현을 시작할 때는 해당 변경의 canonical owner를 먼저 또는 함께 갱신한다.

- 실행 대상과 모듈 의존성: [`development-layers.md`](development-layers.md)
- Host/runtime 명령과 결과: [`runtime-contract.md`](../specs/runtime-contract.md)
- 네트워크, 자격 증명과 원격 경계: [`networking-contract.md`](../specs/networking-contract.md)
- 검증과 증거: [`testing.md`](../testing.md)

PLUS와 `mts_screen`은 읽기 전용 호환성 증거다. 레거시 구현을 복사하거나 플랫폼 구조를 보존하지 않고, 선택한 관찰 가능 동작만 독립 계약으로 재구현한다. MVigsEngine 자료는 구현 및 증거에서 제외한다.

## 결론

모든 SDK를 한 번에 연결하는 단일 범용 브리지는 만들지 않는다. 첫 제품 유스케이스가 요구하는 capability 하나를 선택하고 다음 경계로 구현한 뒤 반복한다.

```text
React Native 제품 기능
  -> 제품 application service
    -> typed capability API
      -> Expo native module adapter
        -> 승인된 vendor SDK
```

XMF/Lua에서 capability가 필요한 경우에도 screen/runtime 모듈이 vendor SDK를 직접 의존하지 않는다.

```text
XMF/Lua
  -> 계약된 runtime command
    -> 제품 coordinator
      -> typed capability API
        -> vendor SDK
      -> 계약된 runtime result event
```

SDK별 패키지와 하나의 거대한 `allnewmts-sdk` 패키지 모두 기본값으로 삼지 않는다. 실제로 선택된 생명주기와 보안 경계 단위로만 모듈을 추가한다.

## 조사 기준선

초기 계획은 다음 read-only revision을 기준으로 작성했다.

| Source | Revision |
| --- | --- |
| AllNewMTS | `3976765301c2c3ebc8d5b911add7f692a979b413` |
| PLUS root | `97d1220f26e2e0f7cf2ee3301b0c7dbe89c6e53a` |
| PLUS Android submodule | `cf4e1927790fe93e4311e36307970c912f20249a` |
| PLUS iOS submodule | `0c1bdfc63eba11013036fd3fb7cdd93b5cb257fa` |
| `mts_screen` | `f079792bcf383b2743676384ffda6c6671ddda10` |

실제 구현 시점에는 revision과 deterministic evidence를 다시 고정한다. 단순히 빌드에 링크된 SDK와 제품 흐름에서 실제 호출되는 SDK를 구분한다.

## 초기 후보 분류

다음은 PLUS 빌드 의존성, 허용된 native 호출부, 기존 RN 브리지와 `mts_screen` 작성 사용을 대조한 초기 후보군이다. 최종 채택 목록이 아니다.

| Capability | 관찰된 SDK 또는 구현 | 기본 판단 |
| --- | --- | --- |
| 보안 입력 | mTransKey | RN에 typed flow API 제공 후보이며 첫 pilot 권장 |
| 인증서·간편인증 | ATON MobileAuth/BioAuth/OTP/SafeKey, SignKorea/Koscom CloudNPKI | 선택된 로그인·서명 유스케이스 단위로 제공 |
| 신분증 OCR | InziSoft OCR | 카메라 권한과 PII 경계를 가진 별도 flow 후보 |
| 안면 촬영·생체 확인 | FacePhi | 카메라·라이선스·백그라운드 취소를 소유하는 별도 flow 후보 |
| 지도 | Naver Maps | native view가 필요한 화면이 선택될 때만 제공 |
| 금융 차트 | IChart 및 Android chart artifact | XMF control slice가 선택될 때 native view 계약으로 제공 |
| Push | Firebase Messaging, TMS | 앱 생명주기와 제품 알림 정책이 소유하며 범용 vendor API는 노출하지 않음 |
| 분석·attribution | Firebase Analytics, Airbridge, Facebook/Kakao 연동 | 제품이 정의한 event schema만 노출하고 vendor payload passthrough는 금지 |
| 앱 보호·백신 | AppSuit, VGuard, LogStack | RN 호출 API보다 pre-RN 초기화와 read-only 상태가 우선 |
| QR·PDF·이미지 선택·외부 브라우저 | ZXing, Polaris Office 및 platform 기능 | RN 또는 OS 기본 기능이 부족한 경우에만 wrapper 추가 |
| 네트워크 암호화 | KeySharp | 기존 `allnewmts-networking` 내부에 유지하고 RN SDK로 별도 노출하지 않음 |
| 구현 보조 | AFNetworking, Glide, SnapKit, Lottie, SkeletonView | RN 공개 capability가 아니며 대체 또는 native 내부 구현으로만 사용 |

## 1. SDK 인벤토리 작성

구현 전 하나의 machine-readable ledger를 만들고 각 SDK에 다음을 기록한다.

- capability ID와 제품 유스케이스
- vendor, 제품명, 정확한 버전
- iOS/Android artifact 이름, SHA-256, 공급 경로
- 재배포 권한, 라이선스 파일, bundle/package ID 제약
- 지원 iOS slice, Android ABI, 최소 OS와 빌드 도구
- 초기화 시점과 main-thread 요구
- Activity/ViewController, background, process-restart 생명주기
- 권한, URL scheme, entitlement, privacy manifest와 manifest component
- 외부 endpoint, credential, token, 저장소와 cleanup 요구
- 처리하는 데이터 등급과 RN에 반환 가능한 최소 필드
- PLUS native 호출부와 `mts_screen` 작성 호출 패턴
- `service`, `flow`, `native-view`, `native-bootstrap` 중 bridge 종류
- `expose`, `native-only`, `replace`, `internal`, `defer` 결정
- deterministic test, device smoke와 rollback 방법

XMF, JavaScript와 native source의 credential-like literal도 값 자체를 기록하지 않고 탐지 여부와 제거 계획만 남긴다.

## 2. Capability 선택

인벤토리를 완성해도 전부 구현하지 않는다. 다음 순서로 첫 slice를 고른다.

1. 첫 AllNewMTS 제품 유스케이스에 필요한가
2. PLUS native 호출과 `mts_screen` 작성 사용이 모두 확인되는가
3. 양 플랫폼에서 하나의 public semantic을 제공할 수 있는가
4. SDK artifact와 AllNewMTS 식별자용 라이선스를 합법적으로 확보했는가
5. 필요한 권한, 원격 endpoint와 민감정보 경계를 계약할 수 있는가

한 항목이라도 충족하지 않으면 해당 capability는 `defer` 또는 명시적 `unsupported`로 남긴다.

## 3. Public contract

선택된 capability는 구현 전에 다음을 계약한다.

- 구체적인 TypeScript 입력과 discriminated result
- bounded error code와 값이 제거된 diagnostic
- 한 번에 허용되는 active operation 수
- timeout, cancel, background, 화면 제거와 module destroy 동작
- callback 순서와 exactly-once completion
- permission denied, SDK unavailable와 license failure
- 입력과 결과의 최대 크기
- 로그와 telemetry에서 제거할 데이터
- 양 플랫폼의 동일한 observable result

`invokeSdk(name, payload)` 같은 범용 JSON 호출이나 vendor 객체의 직접 노출은 허용하지 않는다. 지원하지 않는 입력은 명시적으로 실패하며 platform 또는 사용자 identity로 semantic을 선택하지 않는다.

민감정보는 다음 최소 경계를 지킨다.

- PIN, 비밀번호, 인증서 private key와 복호화 평문은 RN에 반환하지 않는다.
- 보안 입력은 거래 계약이 요구하는 opaque encrypted payload 또는 native handle만 반환한다.
- 서명은 native 안에서 수행하고 private key를 노출하지 않는다.
- OCR/안면 결과는 제품 유스케이스가 선언한 필드만 반환한다.
- 원본 이미지와 임시 파일은 native가 소유하고 성공·취소·오류에서 정리한다.

## 4. 첫 pilot: 보안 입력

첫 pilot 후보는 mTransKey 기반 `allnewmts-secure-input` capability다. PLUS에 RN 호출 경험이 있고 `mts_screen`에도 보안키패드 호출이 반복되므로 service, UI, callback과 보안 경계를 함께 검증할 수 있다.

선행 조건은 다음과 같다.

- AllNewMTS bundle/package ID용 vendor 라이선스 승인
- iOS device/simulator slice와 Android 필수 ABI 확인
- artifact 재배포 및 저장소 반입 승인
- encrypted payload 형식과 소비 주체 계약

최소 public surface는 `show`, `cancel`과 상태 결과만 검토한다. 현재 입력을 다시 조회하는 API와 복호화·hex 변환 결과는 제품 요구가 별도로 입증되지 않는 한 만들지 않는다.

Pilot 완료 조건은 다음과 같다.

- 동시에 한 operation만 허용
- 완료, 사용자 취소, 외부 dismiss, background와 destroy가 exactly once로 종료
- 평문, 키와 입력값이 JS payload 또는 로그에 없음
- vendor 미탑재, 라이선스 오류와 잘못된 설정이 bounded result로 종료
- iOS/Android가 같은 fixture와 public result를 사용
- 제품 또는 capability lab 종료 후 view, listener와 임시 상태가 남지 않음

## 5. 이후 구현 순서

Pilot 이후에도 첫 제품 흐름에 필요한 항목만 추가한다.

1. 로그인 또는 거래 흐름이 선택되면 인증서·간편인증
2. 계좌 개설 흐름이 선택되면 OCR과 안면 촬영
3. release 요구가 확정되면 앱 보호, Push와 crash reporting 생명주기
4. 해당 화면 slice가 선택되면 지도와 차트 native view
5. 제품 event schema가 확정되면 analytics와 attribution
6. OS/RN 기본 기능이 부족하다는 증거가 있을 때만 QR, PDF, 이미지 선택과 외부 브라우저 wrapper

SDK 추가는 앞선 모듈을 추상화하거나 공통 factory를 만드는 계기가 아니다. 두 capability가 실제로 동일한 계약과 생명주기를 공유한다는 증거가 생길 때만 공통 코드를 추출한다.

## 6. XMF/runtime 연결

RN 제품 기능 제공과 XMF Host 확장은 별도 단계다. XMF 작성 사용이 있다는 이유만으로 vendor SDK를 runtime에 연결하지 않는다.

XMF에서 필요해진 capability는 다음을 추가로 요구한다.

- 허용된 실제 XMF와 PLUS native 후보 동작
- canonical Host/runtime Markdown 갱신
- `contracts/host-api.json`의 deny-by-default entry
- runtime command와 결과 event의 bounded schema
- product coordinator의 fake capability test
- 실패·취소 시 runtime revision과 rollback 결정

`packages/screen-runtime`과 `modules/allnewmts-runtime`은 vendor SDK를 링크하지 않는다. XMF Lab도 해당 SDK 없이 deterministic fake command/result로 검증한다.

## 7. Build와 target 격리

각 capability는 Expo Modules autolinking을 사용하되 선택된 실행 대상만 의존한다.

- 제품 앱은 실제 유스케이스에 필요한 capability만 링크한다.
- capability lab은 하나의 선택된 module만 링크한다.
- XMF Lab, Networking Lab과 다른 capability lab은 해당 module을 링크하지 않는다.
- pre-RN 초기화가 필요한 SDK는 제품 app configuration에서 명시적으로 연결한다.
- SDK가 요구하는 permission, entitlement, URL scheme와 manifest component는 제품 대상에만 추가한다.
- 사용하지 않는 SDK binary, permission 또는 초기화 코드는 제품에 포함하지 않는다.

`verify:layers`는 각 slice에서 허용된 dependency와 Expo native-module graph를 검증하도록 갱신한다.

## 8. 검증

기본 자동 검증은 credential-free, remote-free이며 vendor network를 호출하지 않는다.

- TypeScript contract test
- vendor-independent fake adapter test
- 양 플랫폼 입력 검증과 result normalization test
- duplicate completion, cancel, timeout, background와 destroy negative test
- permission denied, module missing와 license failure test
- payload bound와 diagnostic redaction test
- binary artifact 이름, hash, ABI/slice와 target linkage 검사
- product coordinator test
- capability별 Development Build device smoke
- app size와 startup time의 전후 측정

작업 중 `npm run verify:fast`, 완료 시 `npm run verify:ci`를 실행한다. 기기 또는 vendor sandbox smoke는 자동 acceptance에 포함하지 않고, endpoint·credential·허용 동작·cleanup·rollback 계약과 명시적 opt-in이 있을 때만 실행한다.

## 9. Rollout과 rollback

각 capability는 한 제품 유스케이스와 함께 독립적으로 rollout한다. runtime flag로 여러 vendor 구현이나 플랫폼 semantic을 선택하지 않는다.

Rollback은 다음 범위로 제한한다.

1. 제품 package dependency 제거
2. autolink와 app configuration 제거
3. 추가한 permission, entitlement와 manifest component 제거
4. 승인된 vendor artifact 제거
5. capability lab과 해당 verification entry 제거
6. 직전 dependency graph와 제품 흐름 복원

SDK 모듈 격리는 rollback이 runtime, networking 또는 다른 제품 기능의 구현 변경을 요구하지 않도록 유지한다.

## 실행 체크리스트

- [ ] 첫 제품 유스케이스와 필요한 capability 하나 선택
- [ ] PLUS와 `mts_screen` 양쪽 증거 고정
- [ ] artifact, 버전, hash와 라이선스 확인
- [ ] 데이터·권한·원격·생명주기 계약 작성
- [ ] canonical Markdown과 machine contract 갱신
- [ ] typed Expo module과 fake adapter 구현
- [ ] target/autolink 격리 검증
- [ ] deterministic 자동 검증 실행
- [ ] iOS/Android Development Build smoke와 cleanup 기록
- [ ] 리스크와 rollback 기록
