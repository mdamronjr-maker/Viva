import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = (await getCollection('blog', ({ data }) => !data.draft))
    .sort((a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf());

  return rss({
    title: 'Viva Wellness Co. Blog',
    description:
      'Educational articles on peptide therapy, GLP-1 weight loss, hormone optimization, ' +
      'and concierge telehealth. Written from a clinical perspective.',
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.publishDate,
      description: post.data.description,
      author: `info@vivawellnessco.com (${post.data.author})`,
      categories: [post.data.category],
      link: `/blog/${post.id}/`,
    })),
    customData: '<language>en-us</language>',
    stylesheet: false,
  });
}
