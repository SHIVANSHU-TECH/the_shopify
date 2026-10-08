import faq from './faq.json' with { type: 'json' };

const cache = { expiresAt: 0, products: [] };
const clean = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

async function productsFromShopify() {
  if (!process.env.SHOPIFY_SHOP || !process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) return [];
  if (cache.expiresAt > Date.now()) return cache.products;
  const response = await fetch(`https://${process.env.SHOPIFY_SHOP}/admin/api/2025-01/products.json?limit=100&fields=id,title,handle,body_html,product_type,tags,variants`, {headers:{'X-Shopify-Access-Token':process.env.SHOPIFY_ADMIN_ACCESS_TOKEN}});
  if (!response.ok) throw new Error(`Shopify catalog lookup failed (${response.status}).`);
  const { products } = await response.json();
  cache.products = products.map(product => ({title:product.title, content:[product.product_type, product.tags, clean(product.body_html), ...(product.variants || []).map(v => v.title)].join(' '), url:`/products/${product.handle}`}));
  cache.expiresAt = Date.now() + 5 * 60 * 1000;
  return cache.products;
}

export async function relevantKnowledge(query, pageContext = {}) {
  const terms = new Set(clean(query).toLowerCase().split(/\W+/).filter(word => word.length > 2));
  const score = item => [...terms].reduce((sum, term) => sum + (item.content.toLowerCase().includes(term) ? 1 : 0), 0);
  const products = await productsFromShopify().catch(() => []);
  const sources = [...faq, ...products].map(item => ({...item, content:clean(item.content)})).filter(item => score(item) > 0).sort((a,b)=>score(b)-score(a)).slice(0,6);
  if (pageContext.productTitle) sources.unshift({title:pageContext.productTitle, content:clean(pageContext.productDescription), url:pageContext.productUrl});
  return sources.slice(0,6);
}
