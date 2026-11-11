// 시험 대역: next/image는 Next 앱 밖에서 불러올 수 없어(확장자 없는 경로) 아무것도 그리지 않는 대역으로 바꾼다. 운영 코드에서 쓰지 않는다.
export default function Image() {
  return null;
}
