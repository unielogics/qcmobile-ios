// Qualified Commercial logo — RN port of assets/qc-icon.svg.
// Render this directly in the UI; the PNG variants under /assets feed the
// Android/iOS launcher icons via app.json.

import Svg, { Defs, LinearGradient, Line, Path, Rect, Stop, Circle } from "react-native-svg";

export function QcLogo({
  size = 32,
  rounded = true,
}: {
  size?: number;
  /** When false, draws the marks only — useful for inline glyph use. */
  rounded?: boolean;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Defs>
        <LinearGradient id="qcBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#0B1D3A" />
          <Stop offset="100%" stopColor="#050E1F" />
        </LinearGradient>
        <LinearGradient id="qcTeal" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#21d3c7" />
          <Stop offset="100%" stopColor="#18A89F" />
        </LinearGradient>
      </Defs>
      {rounded ? <Rect width={512} height={512} rx={115} fill="url(#qcBg)" /> : null}
      <Circle cx={200} cy={240} r={120} fill="none" stroke="#FFFFFF" strokeWidth={52} />
      <Line x1={280} y1={320} x2={350} y2={400} stroke="#FFFFFF" strokeWidth={52} strokeLinecap="square" />
      <Path
        d="M 460 140 A 130 130 0 1 0 460 370"
        fill="none"
        stroke="url(#qcTeal)"
        strokeWidth={52}
        strokeLinecap="square"
      />
    </Svg>
  );
}
