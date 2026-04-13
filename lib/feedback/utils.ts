export function chatMessageEntityId(
  chatId: string,
  messageTimestamp: number,
  variantId?: string
): string {
  return `${chatId}:${messageTimestamp}:${variantId || "_"}`;
}

export function chatMessageFeedbackKey(
  messageTimestamp: number,
  variantId?: string
): string {
  return `${messageTimestamp}:${variantId || "_"}`;
}
