// Shared trusted-network data. Consumed by the homepage network grid and the
// standalone /partners page. New partners get added here once and surface in
// both places.
//
// Partners without a logo/photo file render the fallback initials block. Drop
// the asset in /public/partners/ and set `image` to wire it up.

export type Partner = {
  name: string;
  operator: string;
  category: string;
  description: string;
  mediaType: 'portrait' | 'logo' | 'logo-dark';
  image?: string;
  imageAlt?: string;
  fallback: string;
  links: { href: string; label: string }[];
};

// Loose grouping used by the /partners page to organize cards by what the
// partner actually does. The homepage grid ignores this and renders the flat
// list in declaration order.
export type PartnerCategory =
  | 'Strength & Conditioning'
  | 'Personal Training'
  | 'Physical Therapy & Recovery'
  | 'Fitness Facilities';

export const partners: Partner[] = [
  {
    name: 'Team Perez',
    operator: 'Austin, TX',
    category: 'Strength & Conditioning',
    description: 'Online and in-person strength coaching for serious lifters and hybrid athletes. Pairs perfectly with metabolic and recomp protocols.',
    mediaType: 'portrait',
    image: '/partners/team-perez.avif',
    imageAlt: 'Jorge Luis of Team Perez, Austin strength and conditioning coach',
    fallback: 'TP',
    links: [
      { href: 'https://www.pontelaspilas.co/', label: 'pontelaspilas.co' },
      { href: 'https://www.instagram.com/jorge_luis_pt/', label: '@jorge_luis_pt' },
    ],
  },
  {
    name: 'Lift ATX',
    operator: 'Austin, TX',
    category: 'Strength & Conditioning',
    description: 'Group strength and conditioning gym in Austin. Programming for lifters who want measurable progression alongside their protocol.',
    mediaType: 'logo',
    image: '/partners/lift-atx.avif',
    imageAlt: 'Lift ATX, Austin strength and conditioning gym',
    fallback: 'LA',
    links: [{ href: 'https://www.liftatx.com/', label: 'liftatx.com' }],
  },
  {
    name: 'Sweat440',
    operator: 'Austin, TX',
    category: 'Strength & Conditioning',
    description: '40-minute HIIT and functional training in a coached group setting. Strong fit for patients who want structured high-intensity conditioning alongside a metabolic or recomp protocol.',
    mediaType: 'logo-dark',
    fallback: 'S4',
    links: [{ href: 'https://sweat440.com/', label: 'sweat440.com' }],
  },
  {
    name: 'Swift Fit Training & PT',
    operator: 'Austin, TX',
    category: 'Physical Therapy & Recovery',
    description: 'Combined personal training and physical therapy under one roof. Useful when a Viva patient needs to rebuild capacity around an old injury.',
    mediaType: 'logo',
    image: '/partners/swift-fit.webp',
    imageAlt: 'Swift Fit Training & PT, Austin personal training and physical therapy',
    fallback: 'SF',
    links: [{ href: 'https://www.swiftfitatx.com/', label: 'swiftfitatx.com' }],
  },
  {
    name: 'Voltex PT',
    operator: 'Austin, TX',
    category: 'Physical Therapy & Recovery',
    description: 'Physical therapy and rehabilitation for the patients who need in-person, hands-on care that no telehealth visit can replace. Movement assessments, manual therapy, return-to-sport.',
    mediaType: 'logo',
    image: '/partners/voltex-pt.svg',
    imageAlt: 'Voltex PT, Austin physical therapy and sports rehabilitation',
    fallback: 'VPT',
    links: [{ href: 'https://voltexpt.com/', label: 'voltexpt.com' }],
  },
  {
    name: 'Austin Sports Therapy',
    operator: 'Austin, TX',
    category: 'Physical Therapy & Recovery',
    description: 'Specialized sports injury recovery for athletes and active adults. Soft tissue work, joint rehabilitation, performance restoration.',
    mediaType: 'logo-dark',
    image: '/partners/austin-sports-therapy.png',
    imageAlt: 'Austin Sports Therapy logo',
    fallback: 'AST',
    links: [{ href: 'https://www.austinsportstherapy.com/', label: 'austinsportstherapy.com' }],
  },
  {
    name: 'Alloy Personal Training',
    operator: 'Austin, TX',
    category: 'Personal Training',
    description: 'Small-group personal training built around the 40-plus body. Strength, mobility, and metabolic conditioning programmed for adults whose training has to actually fit their life.',
    mediaType: 'logo-dark',
    fallback: 'AP',
    links: [{ href: 'https://www.alloypersonaltraining.com/', label: 'alloypersonaltraining.com' }],
  },
  {
    name: 'Bodies by Bastian',
    operator: 'Austin, TX',
    category: 'Personal Training',
    description: 'Personalized training for clients who want structured, attentive coaching. Strong fit for patients on a metabolic or recomp protocol.',
    mediaType: 'logo-dark',
    image: '/partners/bodies-by-bastian.webp',
    imageAlt: 'Bodies by Bastian, Austin personal training with Syd Bastian',
    fallback: 'BB',
    links: [{ href: 'https://www.bodiesbybastian.com/', label: 'bodiesbybastian.com' }],
  },
  {
    name: 'Brian Venturino',
    operator: 'Austin, TX',
    category: 'Personal Training',
    description: 'One-on-one training with a focus on consistent progression and proper breathing mechanics. Reliable referral for patients ready to build a real training habit alongside their protocol.',
    mediaType: 'portrait',
    image: '/partners/brian-venturino.jpg',
    imageAlt: 'Brian Venturino, personal trainer in Austin',
    fallback: 'BV',
    links: [{ href: 'https://www.instagram.com/brianventurino__', label: '@brianventurino__' }],
  },
  {
    name: 'Train with Davis',
    operator: 'Austin, TX',
    category: 'Personal Training',
    description: 'Coaching for clients across strength, conditioning, and body composition. Practical programming, no theatrics.',
    mediaType: 'portrait',
    image: '/partners/train-with-davis.webp',
    imageAlt: 'Davis of Train with Davis, Austin strength and conditioning coach',
    fallback: 'TD',
    links: [{ href: 'https://www.trainwithdavis.com/', label: 'trainwithdavis.com' }],
  },
  {
    name: 'Lifetime Fitness · Clinic South',
    operator: 'Austin, TX',
    category: 'Fitness Facilities',
    description: 'Full-service health and fitness club with on-site clinic. Useful for patients who want a broader fitness facility alongside their concierge care.',
    mediaType: 'logo',
    image: '/partners/lifetime-fitness.png',
    imageAlt: 'Lifetime Fitness Clinic South, Austin health and fitness club',
    fallback: 'LT',
    links: [{ href: 'https://www.lifetime.life/locations/tx/austin-south.html', label: 'lifetime.life · Austin South' }],
  },
];

export const partnerCategoryOrder: PartnerCategory[] = [
  'Strength & Conditioning',
  'Personal Training',
  'Physical Therapy & Recovery',
  'Fitness Facilities',
];

export const partnersByCategory = partnerCategoryOrder
  .map((cat) => ({
    category: cat,
    items: partners.filter((p) => p.category === cat),
  }))
  .filter((g) => g.items.length > 0);
