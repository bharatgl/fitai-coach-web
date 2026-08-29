const attachmentFollowUpPattern = /\b(?:file|attachment|pdf|document|image|photo|picture|report|scan|upload(?:ed)?)\b|\b(?:review|read|analyse|analyze|check|summari[sz]e|explain|look\s+at)\s+(?:this|that|it)\b/i;

export function shouldReuseRecentCoachAttachments(message: string) {
  return attachmentFollowUpPattern.test(message.trim());
}
