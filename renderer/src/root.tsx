import { Composition } from "remotion";
import { RENDER_COMPOSITION_ID, type RenderInputProps } from "../../shared/render";
import { MainVideo } from "./main-video";

const EMPTY_PROPS: RenderInputProps = {
  manifest: { fps: 30, width: 1920, height: 1080, totalDurationInFrames: 1, clips: [], audio: [] },
  sources: {},
};

/** Size, fps and length all come from the manifest each render is given. */
export function RemotionRoot() {
  return (
    <Composition
      id={RENDER_COMPOSITION_ID}
      component={MainVideo}
      durationInFrames={1}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={EMPTY_PROPS}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, props.manifest.totalDurationInFrames),
        fps: props.manifest.fps,
        width: props.manifest.width,
        height: props.manifest.height,
      })}
    />
  );
}
