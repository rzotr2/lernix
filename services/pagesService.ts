export type CreatePageOptions = {
  token: string;
  title: string;
  parentPageId?: string | null;
};

export async function createPage({ token, title, parentPageId = null }: CreatePageOptions) {
  const response = await fetch('/api/pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title, parent_page_id: parentPageId })
  });
  if (!response.ok) {
    throw new Error('Failed to create page');
  }
  const data = await response.json();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('dashboard:refresh'));
  }
  return data.page;
}
