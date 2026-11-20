#!/usr/bin/env bash
set -euo pipefail

# Pinned ItsBrian texture repository snapshot (redistribution permission documented in README).
ITSBRIAN_COMMIT="894006ad417c27f767b66bbcfc1afd1b77655531"
MODEL_COMMIT="a2ce75c09ea64225ce236ddb8f4cafc2715cd651"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p asset-library/ItsBrian-minecraft-textures asset-library/Entity-Models
curl --fail --location --retry 3 \
  "https://codeload.github.com/ItsBrian/minecraft-textures/zip/${ITSBRIAN_COMMIT}" \
  --output "$TMP/itsbrian.zip"
unzip -q "$TMP/itsbrian.zip" -d "$TMP/itsbrian"
cp -R "$TMP/itsbrian/minecraft-textures-${ITSBRIAN_COMMIT}/." \
  asset-library/ItsBrian-minecraft-textures/

curl --fail --location --retry 3 \
  "https://codeload.github.com/InventivetalentDev/minecraft-entity-models/zip/${MODEL_COMMIT}" \
  --output "$TMP/models.zip"
unzip -q "$TMP/models.zip" -d "$TMP/models"
cp -R "$TMP/models/minecraft-entity-models-${MODEL_COMMIT}/minecraft" \
  "$TMP/models/minecraft-entity-models-${MODEL_COMMIT}/animations" \
  asset-library/Entity-Models/

cp -R assets/mob-textures asset-library/Game-Ready-Mob-Textures
cat > asset-library/README-RU.txt <<'EOF'
СБОРНИК ТЕКСТУР И МОДЕЛЕЙ ДЛЯ РАЗРАБОТЧИКА

1) ItsBrian-minecraft-textures/
   Полный снимок репозитория текстур ItsBrian на закреплённом коммите.
   Внутри сохранена исходная структура папок: block/, item/, entity/, gui/, font/ и прочее.
   PNG можно открывать обычным просмотрщиком и копировать в свой проект.

2) Entity-Models/
   JSON-модели и анимации сущностей из отдельного проекта InventivetalentDev.
   Это НЕ репозиторий ItsBrian; источник и версия указаны в манифестах исходного проекта.

3) Game-Ready-Mob-Textures/
   Плоская подборка текстур мобов, уже используемая в браузерной игре.

Цвета и UV-развёртки не теряются: PNG и JSON-файлы оставлены в исходном виде.
См. LICENSE/COPYING/README внутри папок источников перед повторной публикацией.
Атрибуция и разрешение на использование текстур ItsBrian задокументированы
в README основного проекта. Не считайте модели из второго источника частью ItsBrian.
EOF

cat > asset-library/SOURCES.txt <<EOF
ItsBrian/minecraft-textures commit: ${ITSBRIAN_COMMIT}
InventivetalentDev/minecraft-entity-models commit: ${MODEL_COMMIT}
EOF

zip -qr minecraft-assets-library.zip asset-library
