# 프로젝트 목표

이 프로젝트의 목표는 기존 MTS 화면 시스템을 React Native 기반의 Expo 애플리케이션으로 전환하는 것이다.

## 핵심 목표

1. `/Users/chanheekim/Dev/Plus` 프로젝트의 XMS 파싱 및 화면 렌더링 로직을 분석하여 React Native/Expo 환경으로 변환한다.
2. `/Users/chanheekim/Dev/mts_screen/SmartMTS/Resource/Main/scr_xmf`의 화면 정의 파일을 파싱하고 React Native 화면으로 렌더링한다.
3. 기존 Native 외부 SDK는 제거하거나 재구현하지 않고 React Native Native Module로 래핑하여 제공한다.

## 완료 기준

- 대상 XMF 화면 정의 파일이 Expo 기반 React Native 앱에서 파싱되고 화면으로 표시된다.
- 기존 화면의 주요 레이아웃과 동작이 React Native에서 동일하게 재현된다.
- 필요한 Native 외부 SDK 기능을 React Native 코드에서 호출할 수 있다.
