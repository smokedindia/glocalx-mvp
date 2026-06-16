"use client"

/* eslint-disable @next/next/no-img-element */

import { ChatMessage } from "@/app/_components/chat-message"

import {
  platformPreviewKey,
  type PlatformPostPreview,
} from "./app-workspace-model"
import {
  ChatDivider,
  ChoiceButton,
  FlowCard,
} from "./reference-flow-shared"
import type { ReferenceFlowScreensProps } from "./reference-flow-screens"

function platformLabel(preview: PlatformPostPreview): string {
  if (preview.locale === "en") {
    return "영어버전"
  }
  if (preview.locale === "ja") {
    return "日本語"
  }
  return preview.platform === "GBP" ? "GBP" : "Instagram"
}

function tabLabel(preview: PlatformPostPreview): string {
  if (preview.platform === "INSTAGRAM") {
    return "Instagram"
  }
  return platformLabel(preview)
}

function statusMessageForPreview(options: {
  readonly activePreview: PlatformPostPreview | undefined
  readonly publishKind: ReferenceFlowScreensProps["publish"]["kind"]
}): string | null {
  if (options.activePreview === undefined) {
    return null
  }
  if (
    options.activePreview.platform !== "GBP" ||
    options.activePreview.locale !== "ko"
  ) {
    return `${tabLabel(options.activePreview)} 문구가 준비됐습니다. 복사해서 채널에 맞게 올릴 수 있어요.`
  }
  if (options.publishKind === "loading") {
    return "GBP 게시 상태를 확인하는 중"
  }
  if (options.publishKind === "blocked") {
    return "게시 전 Google 비즈니스 프로필 인증이 필요합니다."
  }
  if (options.publishKind === "published") {
    return "게시 요청이 완료됐습니다."
  }
  return null
}

function isGbpPublishPreview(
  preview: PlatformPostPreview | undefined
): boolean {
  return preview?.platform === "GBP" && preview.locale === "ko"
}

function previewActionLabel(preview: PlatformPostPreview | undefined): string {
  if (preview === undefined) {
    return "게시물 발행"
  }
  if (preview.locale === "en") {
    return "영어 문구 복사"
  }
  if (preview.platform === "INSTAGRAM") {
    return "인스타그램 연동 준비 중"
  }
  return "게시물 발행"
}

export function PostingScreen({
  activePreviewKey,
  draft,
  imageAssets,
  onPreviewChange,
  onPublish,
  publish,
}: Pick<
  ReferenceFlowScreensProps,
  | "activePreviewKey"
  | "draft"
  | "imageAssets"
  | "onPreviewChange"
  | "onPublish"
  | "publish"
>) {
  if (draft.kind !== "ready") {
    return (
      <>
        <ChatDivider>STEP 3 · 여러 SNS자동홍보</ChatDivider>
        <ChatMessage
          message="사진과 알리고 싶은 말이나 단어를 먼저 분석하면 채널별 게시물 미리보기가 생성됩니다."
          speaker="assistant"
        />
      </>
    )
  }

  const selectedPreview =
    draft.platformPreviews.find(
      (preview) => platformPreviewKey(preview) === activePreviewKey
    ) ?? draft.platformPreviews[0]
  const selectedPreviewKey =
    selectedPreview === undefined
      ? activePreviewKey
      : platformPreviewKey(selectedPreview)
  const selectedImage =
    selectedPreview === undefined
      ? undefined
      : draft.images.find(
          (image) => image.assetId === selectedPreview.imageAssetId
        )
  const selectedAsset =
    selectedPreview?.imageAssetId === null || selectedPreview === undefined
      ? undefined
      : imageAssets.find((asset) => asset.id === selectedPreview.imageAssetId)
  const imageSrc = selectedImage?.editedDataUrl ?? selectedAsset?.dataUrl
  const publishStatusMessage = statusMessageForPreview({
    activePreview: selectedPreview,
    publishKind: publish.kind,
  })
  const canPublishSelectedPreview = isGbpPublishPreview(selectedPreview)

  return (
    <>
      <ChatDivider>STEP 3 · 여러 SNS자동홍보</ChatDivider>
      <ChatMessage speaker="assistant">
        사진 보정과 문구 생성이 끝났습니다. 업로드 전에 채널과 언어별
        미리보기를 확인해주세요.
      </ChatMessage>
      <FlowCard title="완성된 게시물을 확인해주세요">
        <div className="gx-post-tabs" role="tablist">
          {draft.platformPreviews.map((preview) => (
            <button
              aria-label={preview.label}
              aria-selected={platformPreviewKey(preview) === selectedPreviewKey}
              key={platformPreviewKey(preview)}
              onClick={() => onPreviewChange(platformPreviewKey(preview))}
              role="tab"
              type="button"
            >
              {tabLabel(preview)}
            </button>
          ))}
        </div>
        <div className="gx-post-image gx-post-image-live">
          {imageSrc === undefined ? (
            <span>{selectedPreview?.aspectRatio ?? "1:1"}</span>
          ) : (
            <img
              alt={selectedImage?.altText ?? "게시 미리보기 이미지"}
              src={imageSrc}
              style={{
                filter:
                  selectedImage?.editedDataUrl === null
                    ? selectedImage.cssFilter
                    : undefined,
              }}
            />
          )}
          <strong>{selectedPreview?.aspectRatio ?? "1:1"}</strong>
        </div>
        <p className="gx-post-copy">
          {selectedPreview?.copy ?? draft.koreanCopy}
        </p>
        <div className="gx-hashtag-row">
          {(selectedPreview?.hashtags ?? []).map((hashtag) => (
            <span key={hashtag}>{hashtag}</span>
          ))}
        </div>
        <div className="gx-channel-select">
          <p>업로드 전 체크</p>
          {(selectedPreview?.uploadNotes ?? []).map((note) => (
            <span key={note}>✓ {note}</span>
          ))}
        </div>
      </FlowCard>
      {canPublishSelectedPreview && publish.kind === "loading" ? (
        <ChatMessage
          message="GBP 게시 상태를 확인하는 중"
          speaker="assistant"
        />
      ) : null}
      {canPublishSelectedPreview && publish.kind === "blocked" ? (
        <ChatMessage message={publish.message} speaker="assistant" />
      ) : null}
      {canPublishSelectedPreview && publish.kind === "published" ? (
        <ChatMessage message={publish.message} speaker="assistant" />
      ) : null}
      <div className="gx-actions-row gx-publish-actions">
        {publishStatusMessage === null ? null : (
          <p className="gx-publish-status">{publishStatusMessage}</p>
        )}
        {canPublishSelectedPreview ? (
          <ChoiceButton onClick={onPublish}>
            {previewActionLabel(selectedPreview)}
          </ChoiceButton>
        ) : (
          <ChoiceButton tone="ghost">
            {previewActionLabel(selectedPreview)}
          </ChoiceButton>
        )}
      </div>
    </>
  )
}
