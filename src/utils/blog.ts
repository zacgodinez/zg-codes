import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import type { Post } from '~/types';
import { APP_BLOG } from 'astrowind:config';
import { cleanSlug, trimSlash, BLOG_BASE, POST_PERMALINK_PATTERN, CATEGORY_BASE, TAG_BASE } from './permalinks';

export interface PostData {
  publishDate?: Date;
  updateDate?: Date;
  title: string;
  excerpt?: string;
  image?: string;
  tags?: string[];
  category?: string;
  author?: string;
  draft?: boolean;
  metadata?: Record<string, unknown>;
}

export interface NormalizedDates {
  publishDate: Date;
  updateDate?: Date;
}

const SCORE_POSTS_INCREMENT = 5;
const LATESTS_POSTS_COUNT = 4;
const RELATED_POSTS_COUNT = 4;
const YEAR_LENGTH = 4;
const MONTH_DAY_LENGTH = 2;
const HOUR_MINUTE_SECOND_LENGTH = 2;

const generatePermalink = async ({
  id,
  slug,
  publishDate,
  category,
}: {
  id: string;
  slug: string;
  publishDate: Date;
  category: string | undefined;
}) => {
  const year = String(publishDate.getFullYear()).padStart(YEAR_LENGTH, '0');
  const month = String(publishDate.getMonth() + 1).padStart(MONTH_DAY_LENGTH, '0');
  const day = String(publishDate.getDate()).padStart(MONTH_DAY_LENGTH, '0');
  const hour = String(publishDate.getHours()).padStart(HOUR_MINUTE_SECOND_LENGTH, '0');
  const minute = String(publishDate.getMinutes()).padStart(HOUR_MINUTE_SECOND_LENGTH, '0');
  const second = String(publishDate.getSeconds()).padStart(HOUR_MINUTE_SECOND_LENGTH, '0');

  const permalink = POST_PERMALINK_PATTERN.replace('%slug%', slug)
    .replace('%id%', id)
    .replace('%category%', category || '')
    .replace('%year%', year)
    .replace('%month%', month)
    .replace('%day%', day)
    .replace('%hour%', hour)
    .replace('%minute%', minute)
    .replace('%second%', second);

  return permalink
    .split('/')
    .map((el) => trimSlash(el))
    .filter((el) => !!el)
    .join('/');
};

const normalizePostDates = (rawPublishDate: Date = new Date(), rawUpdateDate?: Date): NormalizedDates => ({
  publishDate: new Date(rawPublishDate),
  updateDate: rawUpdateDate ? new Date(rawUpdateDate) : undefined,
});

const normalizePostCategory = (rawCategory?: string) => {
  if (!rawCategory) return undefined;
  return {
    slug: cleanSlug(rawCategory),
    title: rawCategory,
  };
};

const normalizePostTags = (rawTags: string[] = []) => {
  return rawTags.map((tag) => ({
    slug: cleanSlug(tag),
    title: tag,
  }));
};

const createPostMetadata = async (
  id: string,
  rawSlug: string,
  category: ReturnType<typeof normalizePostCategory>,
  dates: NormalizedDates
) => {
  const slug = cleanSlug(rawSlug);
  const permalink = await generatePermalink({
    id,
    slug,
    publishDate: dates.publishDate,
    category: category?.slug,
  });

  return { slug, permalink };
};

const getNormalizedPost = async (post: CollectionEntry<'post'>): Promise<Post> => {
  const { id, slug: rawSlug = '', data } = post;
  const { Content, remarkPluginFrontmatter } = await post.render();

  const dates = normalizePostDates(data.publishDate, data.updateDate);
  const category = normalizePostCategory(data.category);
  const tags = normalizePostTags(data.tags);
  const { slug, permalink } = await createPostMetadata(id, rawSlug, category, dates);

  return {
    id,
    slug,
    permalink,
    ...dates,
    title: data.title,
    excerpt: data.excerpt,
    image: data.image,
    category,
    tags,
    author: data.author,
    draft: data.draft ?? false,
    metadata: data.metadata ?? {},
    Content,
    readingTime: remarkPluginFrontmatter?.readingTime,
  };
};

const load = async function (): Promise<Array<Post>> {
  const posts = await getCollection('post');
  const normalizedPosts = posts.map(async (post) => await getNormalizedPost(post));

  const results = (await Promise.all(normalizedPosts))
    .sort((a, b) => b.publishDate.valueOf() - a.publishDate.valueOf())
    .filter((post) => !post.draft);

  return results;
};

let _posts: Array<Post>;

export const isBlogEnabled = APP_BLOG.isEnabled;
export const isRelatedPostsEnabled = APP_BLOG.isRelatedPostsEnabled;
export const isBlogListRouteEnabled = APP_BLOG.list.isEnabled;
export const isBlogPostRouteEnabled = APP_BLOG.post.isEnabled;
export const isBlogCategoryRouteEnabled = APP_BLOG.category.isEnabled;
export const isBlogTagRouteEnabled = APP_BLOG.tag.isEnabled;

export const blogListRobots = APP_BLOG.list.robots;
export const blogPostRobots = APP_BLOG.post.robots;
export const blogCategoryRobots = APP_BLOG.category.robots;
export const blogTagRobots = APP_BLOG.tag.robots;

export const blogPostsPerPage = APP_BLOG?.postsPerPage;

export const fetchPosts = async (): Promise<Array<Post>> => {
  if (!_posts) {
    _posts = await load();
  }

  return _posts;
};

export const findPostsBySlugs = async (slugs: Array<string>): Promise<Array<Post>> => {
  if (!Array.isArray(slugs)) return [];

  const posts = await fetchPosts();

  return slugs.reduce(function (r: Array<Post>, slug: string) {
    posts.some(function (post: Post) {
      return slug === post.slug && r.push(post);
    });
    return r;
  }, []);
};

export const findPostsByIds = async (ids: Array<string>): Promise<Array<Post>> => {
  if (!Array.isArray(ids)) return [];

  const posts = await fetchPosts();

  return ids.reduce(function (r: Array<Post>, id: string) {
    posts.some(function (post: Post) {
      return id === post.id && r.push(post);
    });
    return r;
  }, []);
};

export const findLatestPosts = async ({ count = LATESTS_POSTS_COUNT }: { count?: number }): Promise<Array<Post>> => {
  const posts = await fetchPosts();
  return posts ? posts.slice(0, count) : [];
};

export const getStaticPathsBlogList = async ({ paginate }: { paginate }) => {
  if (!isBlogEnabled || !isBlogListRouteEnabled) return [];
  return paginate(await fetchPosts(), {
    params: { blog: BLOG_BASE || undefined },
    pageSize: blogPostsPerPage,
  });
};

export const getStaticPathsBlogPost = async () => {
  if (!isBlogEnabled || !isBlogPostRouteEnabled) return [];
  return (await fetchPosts()).flatMap((post) => ({
    params: {
      blog: post.permalink,
    },
    props: { post },
  }));
};

export const getStaticPathsBlogCategory = async ({ paginate }: { paginate }) => {
  if (!isBlogEnabled || !isBlogCategoryRouteEnabled) return [];

  const posts = await fetchPosts();
  const categories = {};
  posts.map((post) => {
    if (post.category?.slug) {
      categories[post.category.slug] = post.category;
    }
  });

  return Array.from(Object.keys(categories)).flatMap((categorySlug) =>
    paginate(
      posts.filter((post) => post.category?.slug && categorySlug === post.category?.slug),
      {
        params: { category: categorySlug, blog: CATEGORY_BASE || undefined },
        pageSize: blogPostsPerPage,
        props: { category: categories[categorySlug] },
      }
    )
  );
};

export const getStaticPathsBlogTag = async ({ paginate }: { paginate }) => {
  if (!isBlogEnabled || !isBlogTagRouteEnabled) return [];

  const posts = await fetchPosts();
  const tags = {};
  posts.map((post) => {
    return (
      Array.isArray(post.tags) &&
      post.tags.map((tag) => {
        tags[tag?.slug] = tag;
      })
    );
  });

  return Array.from(Object.keys(tags)).flatMap((tagSlug) =>
    paginate(
      posts.filter((post) => Array.isArray(post.tags) && post.tags.find((elem) => elem.slug === tagSlug)),
      {
        params: { tag: tagSlug, blog: TAG_BASE || undefined },
        pageSize: blogPostsPerPage,
        props: { tag: tags[tagSlug] },
      }
    )
  );
};

export async function getRelatedPosts(originalPost: Post, maxResults: number = RELATED_POSTS_COUNT): Promise<Post[]> {
  const allPosts = await fetchPosts();
  const originalTagsSet = new Set(originalPost.tags ? originalPost.tags.map((tag) => tag.slug) : []);

  const postsWithScores = allPosts.reduce((acc: { post: Post; score: number }[], iteratedPost: Post) => {
    if (iteratedPost.slug === originalPost.slug) return acc;

    let SCORE = 0;
    if (iteratedPost.category && originalPost.category && iteratedPost.category.slug === originalPost.category.slug) {
      SCORE += SCORE_POSTS_INCREMENT;
    }

    if (iteratedPost.tags) {
      iteratedPost.tags.forEach((tag) => {
        if (originalTagsSet.has(tag.slug)) {
          SCORE += 1;
        }
      });
    }

    acc.push({ post: iteratedPost, score: SCORE });
    return acc;
  }, []);

  postsWithScores.sort((a, b) => b.score - a.score);

  const selectedPosts: Post[] = [];
  let postsIterator = 0;
  while (selectedPosts.length < maxResults && postsIterator < postsWithScores.length) {
    selectedPosts.push(postsWithScores[postsIterator].post);
    postsIterator++;
  }

  return selectedPosts;
}
