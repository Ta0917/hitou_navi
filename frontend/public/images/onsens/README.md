ここに各温泉のヒーロー画像を配置する。

命名規則：`{onsens.slug}.jpg`（例: `noboribetsu-test.jpg`）

`backend/seed.py` は `onsens.hero_image_url` に `/images/onsens/{slug}.jpg` という
相対パスを自動生成して保存している。このフォルダに同名のファイルを置けば、
コード変更なしにフロントエンドの `<img src={onsen.hero_image_url} />` がそのまま表示する。

対象slug一覧（2026-07-04時点、10施設）：
- noboribetsu-test.jpg
- nyuto-tsurunoyu.jpg
- yachi-onsen.jpg
- houshi-onsen.jpg
- shirahone-onsen.jpg
- omaki-onsen.jpg
- ryujin-onsen.jpg
- okutsu-onsen.jpg
- iya-onsen.jpg
- myoken-onsen.jpg
