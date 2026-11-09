import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { StarFilledIcon } from "@/icons";
import { useTranslations } from "@/i18n";
import type { ScriptScene } from "@shared/types";

const HEADER_CELL = "px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400";
const BODY_CELL = "px-4 py-3 align-top text-sm text-gray-500 dark:text-gray-400";

export default function ScenesTable({ scenes }: { scenes: ScriptScene[] }) {
  const t = useTranslations("videoStudio.script");

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="border-b border-gray-100 dark:border-gray-800">
          <TableRow>
            <TableCell isHeader className={HEADER_CELL}>
              #
            </TableCell>
            <TableCell isHeader className={HEADER_CELL}>
              {t("sceneContent")}
            </TableCell>
            <TableCell isHeader className={HEADER_CELL}>
              {t("sceneVisual")}
            </TableCell>
            <TableCell isHeader className={HEADER_CELL}>
              {t("sceneShot")}
            </TableCell>
            <TableCell isHeader className={HEADER_CELL}>
              {t("sceneAssets")}
            </TableCell>
            <TableCell isHeader className={HEADER_CELL}>
              {t("sceneDuration")}
            </TableCell>
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
          {scenes.map((scene) => (
            <TableRow key={scene.index}>
              <TableCell className={BODY_CELL}>
                <div className="flex items-center gap-1">
                  {scene.index}
                  {scene.heroMoment && <StarFilledIcon className="size-3.5 text-yellow-400" />}
                </div>
              </TableCell>
              <TableCell className="px-4 py-3 align-top text-sm text-gray-700 dark:text-gray-300">
                <Badge variant="light" color="primary" size="sm" className="mb-1.5">
                  {t(`narrativeRoles.${scene.narrativeRole}`)}
                </Badge>
                <div>{scene.content}</div>
              </TableCell>
              <TableCell className={BODY_CELL}>{scene.visualDescription}</TableCell>
              <TableCell className={BODY_CELL}>
                {t(`shotSizes.${scene.shotSize}`)} · {t(`cameraMovements.${scene.cameraMovement}`)}
              </TableCell>
              <TableCell className={BODY_CELL}>
                <div className="flex flex-col gap-1">
                  {scene.requiredAssets.map((asset, i) => (
                    <Badge key={i} variant="light" color="gray" size="sm">
                      {asset.description}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className={BODY_CELL}>{scene.estimatedDurationSec}s</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
