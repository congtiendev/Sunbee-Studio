import type { ComponentType } from "react";
import type { ShotKind } from "../../../shared/types";
import { KenBurns, LowerThirdCaption, StaticHold, TitleCard } from "./base";
import type { ShotProps } from "./common";
import { BlurSlideTitle, CrashZoom, JumpCut, MarkerTitle, PullBack, TextMask } from "./shotcraft";

const SHOTS: Record<ShotKind, ComponentType<ShotProps>> = {
  staticHold: StaticHold,
  kenBurns: KenBurns,
  lowerThirdCaption: LowerThirdCaption,
  titleCard: TitleCard,
  blurSlideTitle: BlurSlideTitle,
  markerTitle: MarkerTitle,
  textMask: TextMask,
  crashZoom: CrashZoom,
  jumpCut: JumpCut,
  pullBack: PullBack,
};

/** Shots that typeset the clip's text themselves (no separate caption layered on top). */
export const TEXT_SHOTS: ShotKind[] = ["titleCard", "blurSlideTitle", "markerTitle", "textMask"];

/** The picture of one clip, by its `shotKind`; unknown kinds (an older renderer) fall back to Ken Burns. */
export function ClipVisual(props: ShotProps) {
  const Shot = SHOTS[props.clip.shotKind] ?? KenBurns;
  return <Shot {...props} />;
}
