export interface SkillUrlMetadataFields {
  source_url?: string;
  content_url?: string;
  icon_url?: string;
}

export interface SkillUrlMetadataIssue {
  field: keyof SkillUrlMetadataFields;
  message: string;
}

const BASE64_IMAGE_DATA_URL_PATTERN = /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/iu;

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isSafeSkillIconUrl(value: string): boolean {
  return isHttpUrl(value) || BASE64_IMAGE_DATA_URL_PATTERN.test(value);
}

export function collectSkillUrlMetadataIssues(data: SkillUrlMetadataFields): SkillUrlMetadataIssue[] {
  const issues: SkillUrlMetadataIssue[] = [];

  if (data.source_url !== undefined && !isHttpUrl(data.source_url)) {
    issues.push({
      field: 'source_url',
      message: 'source_url must use HTTP(S)',
    });
  }

  if (data.content_url !== undefined && !isHttpUrl(data.content_url)) {
    issues.push({
      field: 'content_url',
      message: 'content_url must use HTTP(S)',
    });
  }

  if (data.icon_url !== undefined && !isSafeSkillIconUrl(data.icon_url)) {
    issues.push({
      field: 'icon_url',
      message: 'icon_url must use HTTP(S) or a base64 image data URL',
    });
  }

  return issues;
}
