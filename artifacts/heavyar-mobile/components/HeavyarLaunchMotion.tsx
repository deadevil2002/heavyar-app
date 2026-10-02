import React, { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const LAUNCH_BACKGROUND = "#011B53";
const BRAND_YELLOW = "#F1B61D";
const BRAND_BLUE = "#4389CC";
const SOFT_WHITE = "#F7F9FC";
const FULL_DURATION_MS = 1340;
const EXIT_DURATION_MS = 190;

type HeavyarRuntime = typeof globalThis & {
  __heavyarLaunchMotionShown?: boolean;
};

/**
 * Claims the launch motion once for the lifetime of the active JavaScript
 * runtime. A real cold start creates a new runtime; navigation, auth changes,
 * and Fast Refresh keep this sentinel and therefore cannot replay the motion.
 */
export function claimHeavyarLaunchMotion(): boolean {
  const runtime = globalThis as HeavyarRuntime;
  if (runtime.__heavyarLaunchMotionShown) return false;
  runtime.__heavyarLaunchMotionShown = true;
  return true;
}

type HeavyarLaunchMotionProps = {
  onFinished: () => void;
};

export default function HeavyarLaunchMotion({ onFinished }: HeavyarLaunchMotionProps) {
  const reduceMotion = useReducedMotion();
  const groundProgress = useSharedValue(0);
  const equipmentProgress = useSharedValue(0);
  const sceneOpacity = useSharedValue(1);
  const boomAngle = useSharedValue(-8);
  const hookOffset = useSharedValue(-7);
  const brandProgress = useSharedValue(0);
  const highlightProgress = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      brandProgress.value = withTiming(1, { duration: 180 });
      overlayOpacity.value = withDelay(
        360,
        withTiming(0, { duration: 160 }, (finished) => {
          if (finished) runOnJS(onFinished)();
        }),
      );
      return;
    }

    groundProgress.value = withTiming(1, {
      duration: 230,
      easing: Easing.out(Easing.cubic),
    });
    equipmentProgress.value = withDelay(
      110,
      withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }),
    );
    boomAngle.value = withDelay(
      335,
      withSequence(
        withTiming(2, { duration: 175, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 205, easing: Easing.out(Easing.cubic) }),
      ),
    );
    hookOffset.value = withDelay(
      265,
      withSequence(
        withTiming(9, { duration: 210, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 190, easing: Easing.out(Easing.cubic) }),
      ),
    );
    brandProgress.value = withDelay(
      635,
      withTiming(1, { duration: 275, easing: Easing.out(Easing.cubic) }),
    );
    sceneOpacity.value = withDelay(
      690,
      withTiming(0, { duration: 235, easing: Easing.in(Easing.quad) }),
    );
    highlightProgress.value = withDelay(
      785,
      withTiming(1, { duration: 285, easing: Easing.inOut(Easing.quad) }),
    );
    overlayOpacity.value = withDelay(
      FULL_DURATION_MS - EXIT_DURATION_MS,
      withTiming(0, { duration: EXIT_DURATION_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(onFinished)();
      }),
    );
  }, [
    boomAngle,
    brandProgress,
    equipmentProgress,
    groundProgress,
    highlightProgress,
    hookOffset,
    onFinished,
    overlayOpacity,
    reduceMotion,
    sceneOpacity,
  ]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const groundStyle = useAnimatedStyle(() => ({
    opacity: groundProgress.value,
    transform: [{ scaleX: groundProgress.value }],
  }));

  const equipmentStyle = useAnimatedStyle(() => ({
    opacity: equipmentProgress.value * sceneOpacity.value,
    transform: [
      { translateY: interpolate(equipmentProgress.value, [0, 1], [10, 0]) },
      { scale: interpolate(equipmentProgress.value, [0, 1], [0.96, 1]) },
    ],
  }));

  const boomStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: 37 },
      { translateY: 31 },
      { rotateZ: `${boomAngle.value}deg` },
      { translateX: -37 },
      { translateY: -31 },
    ],
  }));

  const hookStyle = useAnimatedStyle(() => ({
    opacity: equipmentProgress.value * sceneOpacity.value,
    transform: [{ translateY: hookOffset.value }],
  }));

  const brandStyle = useAnimatedStyle(() => ({
    opacity: brandProgress.value,
    transform: [
      { translateY: interpolate(brandProgress.value, [0, 1], [8, 0]) },
      { scale: interpolate(brandProgress.value, [0, 1], [0.965, 1]) },
    ],
  }));

  const highlightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(highlightProgress.value, [0, 0.12, 0.82, 1], [0, 0.2, 0.2, 0]),
    transform: [
      { translateX: interpolate(highlightProgress.value, [0, 1], [-150, 150]) },
      { skewX: "-14deg" },
    ],
  }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="auto"
      style={[styles.overlay, overlayStyle]}
      testID="heavyar-launch-motion"
    >
      <View style={styles.motionStage}>
        <Animated.View style={[styles.equipmentScene, equipmentStyle]}>
          <View style={styles.excavator}>
            <Svg width={118} height={72} viewBox="0 0 118 72">
              <Rect x="32" y="43" width="48" height="16" rx="5" fill={BRAND_YELLOW} />
              <Path d="M47 43V28h20l9 15H47Z" fill={BRAND_BLUE} />
              <Path d="M52 33h11l6 10H52V33Z" fill={SOFT_WHITE} opacity={0.9} />
              <Rect x="22" y="57" width="69" height="11" rx="5.5" fill="#071C3F" />
              <Line x1="30" y1="62.5" x2="83" y2="62.5" stroke={BRAND_BLUE} strokeWidth="2.5" strokeLinecap="round" />
              <Circle cx="39" cy="62.5" r="3.2" fill={SOFT_WHITE} opacity={0.72} />
              <Circle cx="75" cy="62.5" r="3.2" fill={SOFT_WHITE} opacity={0.72} />
            </Svg>

            <Animated.View style={[styles.boom, boomStyle]}>
              <Svg width={94} height={57} viewBox="0 0 94 57">
                <Path
                  d="M77 47 61 24 19 10"
                  fill="none"
                  stroke={BRAND_YELLOW}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Path
                  d="M20 10 8 34"
                  fill="none"
                  stroke={BRAND_YELLOW}
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <Path d="M2 33h16l-3 12H5L2 33Z" fill={BRAND_YELLOW} />
                <Circle cx="61" cy="24" r="3" fill={LAUNCH_BACKGROUND} />
                <Circle cx="19" cy="10" r="3" fill={LAUNCH_BACKGROUND} />
              </Svg>
            </Animated.View>
          </View>

          <View style={styles.crane}>
            <Svg width={91} height={83} viewBox="0 0 91 83">
              <Path d="M58 10V78M53 18h10M53 30h10M53 42h10M53 54h10M53 66h10" stroke={BRAND_BLUE} strokeWidth="2.5" strokeLinecap="round" />
              <Path d="M58 10 82 24H28L58 10ZM28 24H7" fill="none" stroke={BRAND_YELLOW} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <Path d="m58 10-8 14m8-14 8 14" stroke={BRAND_YELLOW} strokeWidth="2" />
            </Svg>
            <Animated.View style={[styles.hook, hookStyle]}>
              <Svg width={18} height={47} viewBox="0 0 18 47">
                <Line x1="9" y1="0" x2="9" y2="32" stroke={SOFT_WHITE} strokeWidth="1.8" />
                <Path d="M9 31v5c0 6 7 6 7 0" fill="none" stroke={BRAND_YELLOW} strokeWidth="2.6" strokeLinecap="round" />
              </Svg>
            </Animated.View>
          </View>
        </Animated.View>

        <Animated.View style={[styles.ground, groundStyle]} />

        <Animated.View style={[styles.brand, brandStyle]}>
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={require("../assets/images/splash-icon.png")}
            style={styles.brandImage}
          />
          <Animated.View pointerEvents="none" style={[styles.highlight, highlightStyle]} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: LAUNCH_BACKGROUND,
    elevation: 100,
    justifyContent: "center",
    zIndex: 1000,
  },
  motionStage: {
    alignItems: "center",
    height: 236,
    justifyContent: "center",
    width: 286,
  },
  equipmentScene: {
    height: 104,
    left: 27,
    position: "absolute",
    top: 23,
    width: 232,
  },
  excavator: {
    bottom: 3,
    height: 78,
    left: 0,
    position: "absolute",
    width: 126,
  },
  boom: {
    height: 57,
    left: 0,
    position: "absolute",
    top: 0,
    width: 94,
  },
  crane: {
    height: 86,
    position: "absolute",
    right: 1,
    top: 0,
    width: 91,
  },
  hook: {
    left: 9,
    position: "absolute",
    top: 22,
  },
  ground: {
    backgroundColor: BRAND_BLUE,
    borderRadius: 999,
    height: 2,
    position: "absolute",
    top: 126,
    width: 248,
  },
  brand: {
    alignItems: "center",
    height: 190,
    justifyContent: "center",
    overflow: "hidden",
    position: "absolute",
    width: 190,
  },
  brandImage: {
    height: 190,
    width: 190,
  },
  highlight: {
    backgroundColor: BRAND_YELLOW,
    height: 218,
    position: "absolute",
    width: 18,
  },
});
