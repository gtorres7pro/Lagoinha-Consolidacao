/**
 * HUB Workspace Router
 * Reads workspace slug from URL path and resolves workspace_id from Supabase.
 * 
 * URL pattern: hub.7pro.tech/[slug]/[page]
 * Example:     hub.7pro.tech/orlando/dashboard
 *              hub.7pro.tech/braga/form-visitantes
 */

const SUPABASE_URL = 'https://uyseheucqikgcorrygzc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5c2VoZXVjcWlrZ2NvcnJ5Z3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDcxMzIsImV4cCI6MjA4OTQyMzEzMn0._O9Wb2duZKRo9kSU_K_9sEl-7wEeQlEeR1GBuCSRVdI';

/**
 * Extracts the workspace slug from the current URL path.
 * e.g. /orlando/dashboard → "orlando"
 *      /braga/form-visitantes → "braga"
 *      /login.html → null (no workspace in URL)
 */
function getSlugFromURL() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  // If first segment is a known system path, no workspace slug present
  const systemPaths = ['login.html', 'forgot-password.html', 'reset-password.html', 'dev', 'regional', 'global'];
  if (parts.length === 0 || systemPaths.includes(parts[0])) return null;
  // If it ends in .html it's probably a legacy path
  if (parts[0].endsWith('.html')) return null;
  return parts[0];
}

/**
 * Resolves workspace data from slug.
 * Returns { id, name, slug, status, plan, settings } or null if not found.
 * Caches the result in sessionStorage for performance.
 */
async function resolveWorkspace(slug) {
  if (!slug) return null;

  // Check cache first
  const cached = sessionStorage.getItem(`workspace:${slug}`);
  if (cached) return JSON.parse(cached);

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sb
    .from('workspaces')
    .select('id, name, slug, status, plan, settings, regional_id, global_id')
    .eq('slug', slug)
    .single();

  if (error || !data) {
    console.warn(`[Router] Workspace not found for slug: "${slug}"`);
    return null;
  }

  // Cache for session
  sessionStorage.setItem(`workspace:${slug}`, JSON.stringify(data));
  return data;
}

/**
 * Gets the current workspace context.
 * Call this on page load before doing any data operations.
 * 
 * Usage:
 *   const workspace = await HubRouter.getWorkspace();
 *   if (!workspace) { // handle no workspace }
 *   console.log(workspace.id); // use in all DB queries
 */
const HubRouter = {
  _workspace: null,

  async getWorkspace() {
    if (this._workspace) return this._workspace;
    const slug = getSlugFromURL();
    this._workspace = await resolveWorkspace(slug);
    return this._workspace;
  },

  getSlug() {
    return getSlugFromURL();
  },

  /**
   * Redirects to the workspace-prefixed version of a page.
   * e.g. navigateTo('dashboard') → /orlando/dashboard
   */
  navigateTo(page) {
    const slug = this.getSlug();
    const base = slug ? `/${slug}/${page}` : `/${page}`;
    window.location.href = base;
  },

  /**
   * For public forms: resolves workspace silently and returns workspace_id.
   * Use in consolidation/visitor forms to tag submissions correctly.
   */
  async getWorkspaceId() {
    const ws = await this.getWorkspace();
    return ws ? ws.id : null;
  }
};

// Make globally available
window.HubRouter = HubRouter;
