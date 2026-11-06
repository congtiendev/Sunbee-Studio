import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  useTheme,
  useStyle,
  type ScaleMode,
  type ThemeMode,
  type UiStyle,
} from "@/contexts";
import { useTranslations } from "@/i18n";
import { SparkIcon, XIcon } from "@/icons";
import { useRef, useState } from "react";

export default function LiquidGlassPanel() {
  const t = useTranslations("liquidGlassPanel");
  const [collapsed, setCollapsed] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlValue, setUrlValue] = useState("");

  const { themeMode, setThemeMode } = useTheme();
  const {
    style,
    setStyle,
    glassOpacity,
    setGlassOpacity,
    glassRadius,
    setGlassRadius,
    scaleMode,
    setScaleMode,
    backgroundLabel,
    backgroundInfo,
    backgroundError,
    setBackgroundFromFile,
    setBackgroundFromUrl,
    resetBackground,
  } = useStyle();

  if (collapsed) {
    return (
      <Button
        variant="outline"
        size="icon-lg"
        className="card-surface fixed right-4.5 bottom-4.5 z-20 rounded-full!"
        aria-label={t("open")}
        onClick={() => setCollapsed(false)}
      >
        <SparkIcon />
      </Button>
    );
  }

  return (
    <div className="card-surface fixed right-4.5 bottom-4.5 z-20 w-69 p-3.5 text-sm">
      <div className="flex items-center justify-between gap-2.5">
        <span className="font-semibold text-gray-800 dark:text-white/90">
          {t("title")}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("close")}
          onClick={() => setCollapsed(true)}
        >
          <XIcon className="size-4" />
        </Button>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <Row label={t("styleLabel")}>
          <Select value={style} onValueChange={(v) => setStyle(v as UiStyle)}>
            <SelectTrigger size="sm" className="flex-1">
              <SelectValue>
                {() => (style === "liquid" ? t("styleLiquid") : t("styleClassic"))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="classic">{t("styleClassic")}</SelectItem>
              <SelectItem value="liquid">{t("styleLiquid")}</SelectItem>
            </SelectContent>
          </Select>
        </Row>

        <Row label={t("themeLabel")}>
          <Select
            value={themeMode}
            onValueChange={(v) => setThemeMode(v as ThemeMode)}
          >
            <SelectTrigger size="sm" className="flex-1">
              <SelectValue>
                {() =>
                  themeMode === "auto"
                    ? t("themeAuto")
                    : themeMode === "light"
                      ? t("themeLight")
                      : t("themeDark")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{t("themeAuto")}</SelectItem>
              <SelectItem value="light">{t("themeLight")}</SelectItem>
              <SelectItem value="dark">{t("themeDark")}</SelectItem>
            </SelectContent>
          </Select>
        </Row>

        <Row label={t("scaleLabel")}>
          <Select value={scaleMode} onValueChange={(v) => setScaleMode(v as ScaleMode)}>
            <SelectTrigger size="sm" className="flex-1">
              <SelectValue>
                {() =>
                  scaleMode === "medium"
                    ? t("scaleMedium")
                    : scaleMode === "auto"
                      ? t("scaleAuto")
                      : t("scaleOff")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="medium">{t("scaleMedium")}</SelectItem>
              <SelectItem value="auto">{t("scaleAuto")}</SelectItem>
              <SelectItem value="off">{t("scaleOff")}</SelectItem>
            </SelectContent>
          </Select>
        </Row>

        {backgroundInfo && (
          <div className="flex gap-1.5">
            {[0.3, 0.45, 0.6, 0.75].map((lightness) => (
              <span
                key={lightness}
                className="h-6.5 flex-1 rounded-lg border border-black/10"
                style={{
                  backgroundColor: `hsl(${backgroundInfo.h} ${Math.round((backgroundInfo.neutral ? 0.14 : backgroundInfo.s) * 100)}% ${Math.round(lightness * 100)}%)`,
                }}
              />
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => fileInputRef.current?.click()}
          >
            {t("uploadBackground")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setBackgroundFromFile(file);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={resetBackground}
          >
            {t("defaultBackground")}
          </Button>
        </div>

        <div className="flex gap-2">
          <Input
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && urlValue.trim()) {
                setBackgroundFromUrl(urlValue.trim());
              }
            }}
            placeholder={t("urlPlaceholder")}
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => urlValue.trim() && setBackgroundFromUrl(urlValue.trim())}
          >
            {t("apply")}
          </Button>
        </div>

        <Row label={t("opacityLabel")}>
          <Slider
            value={[glassOpacity]}
            onValueChange={(v) => setGlassOpacity((v as number[])[0]!)}
            min={50}
            max={95}
          />
        </Row>

        <Row label={t("radiusLabel")}>
          <Slider
            value={[glassRadius]}
            onValueChange={(v) => setGlassRadius((v as number[])[0]!)}
            min={8}
            max={40}
          />
        </Row>

        {backgroundError ? (
          <p role="status" className="text-xs text-error-500">
            {backgroundError}
          </p>
        ) : (
          backgroundInfo && (
            <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {t("backgroundInfo", {
                label: backgroundLabel,
                hue: Math.round(backgroundInfo.h),
                sat: Math.round(backgroundInfo.s * 100),
              })}
              {backgroundInfo.neutral ? ` ${t("backgroundNeutral")}` : ""}
            </p>
          )
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-gray-600 dark:text-gray-400">{label}</span>
      {children}
    </div>
  );
}
