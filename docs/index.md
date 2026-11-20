---
type: document
title: triplan ドキュメント
description: 人・モノ・金の3軸でプロジェクトの意思決定を支援するリソース管理ツールtriplanのドキュメントサイト。
tags: [index, documentation]
status: active
sources:
  - リポジトリ実装（2026-08-19時点）
---

## triplanとは

年度単位で案件別・担当者別の月次リソース配分を管理し、**人・モノ・金**の3軸で
プロジェクトの意思決定を支援するツールのドキュメントサイトです。

## はじめての方へ

- **[プロジェクト管理の基礎](guide/project-management.md)** —
  QCD（品質・コスト・納期）と人・モノ・金の関係、管理の基本サイクル、よくある失敗。
  プロジェクト管理の経験が無い方はここから
- **[triplanの使い所（コンセプト）](guide/concept.md)** —
  何をして何をしないツールか、向いている場面、導入の段取り

## 利用者向け

- **[利用ガイド](guide/index.md)** — 画面ごとの使い方・運用の流れ（スクリーンショット付き）

## 開発者向け

- [project.md](project.md) — 概要・コマンド・技術スタック・ルーティングとストアの索引
- [architecture.md](architecture.md) — レイヤー構成の概観・テスト配置・ドキュメント責務
- [data-model.md](data-model.md) — エンティティ索引・データモデル共通の原則
- [development-patterns.md](development-patterns.md) — コード規約・落とし穴の索引
- 詳細リファレンスは `reference/` 配下（[project](reference/project/routing.md)・[architecture](reference/architecture/directory-features-a.md)・[data-model](reference/data-model/database.md)・[patterns](reference/patterns/design-system.md)）。入口は上の4ファイルの索引表

> このサイトはリポジトリの `docs/` フォルダから生成されています。
> GitHub Pagesの設定: リポジトリ Settings → Pages → Branch: `main`・Folder: `/docs`
> スクリーンショットの再生成: `node scripts/capture-doc-screenshots.mjs`
