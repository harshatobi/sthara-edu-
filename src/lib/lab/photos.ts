/**
 * Real photographs shown beside the hand-drawn diagrams in the practicals.
 * All from Wikimedia Commons under open licences that allow reuse with credit
 * (CC BY, CC BY-SA, CC0 or public domain; no NonCommercial or NoDerivatives).
 * Downloaded at 900 px wide into public/lab/photos/ on 2026-10-18; the credit
 * line must be shown wherever the photo is.
 */

export interface Photo { id: string; src: string; caption: string; author: string; licence: string; licenceUrl: string | null; page: string }

export const PHOTOS: Record<string, Photo> = {
  'amoeba': { id: 'amoeba', src: '/lab/photos/amoeba.jpg', caption: 'Amoeba proteus with pseudopodia, light microscope', author: 'Cymothoa exigua', licence: 'CC BY-SA 3.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0', page: 'https://commons.wikimedia.org/wiki/File:Amoeba_proteus.jpg' },
  'bread-mould': { id: 'bread-mould', src: '/lab/photos/bread-mould.jpg', caption: 'Bread mould (Rhizopus): sporangia on hyphae', author: 'Curtis Clark', licence: 'CC BY-SA 3.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0', page: 'https://commons.wikimedia.org/wiki/File:Rhizopus_clonal_sporangia.jpg' },
  'cheek-cells': { id: 'cheek-cells', src: '/lab/photos/cheek-cells.jpg', caption: 'Human cheek cells, methylene blue', author: 'Fritzmann2002', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0', page: 'https://commons.wikimedia.org/wiki/File:Human_Cheek_Cells_(Methylene_Blue_Stain).jpg' },
  'earthworm': { id: 'earthworm', src: '/lab/photos/earthworm.jpg', caption: 'Earthworm', author: 'Rob Hille', licence: 'CC BY-SA 3.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0', page: 'https://commons.wikimedia.org/wiki/File:Earthworm_01.jpg' },
  'fern': { id: 'fern', src: '/lab/photos/fern.jpg', caption: 'Fern frond with sori on the underside', author: 'Petritap', licence: 'CC BY-SA 3.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0', page: 'https://commons.wikimedia.org/wiki/File:Fern-frond-sori.jpg' },
  'gram-seed': { id: 'gram-seed', src: '/lab/photos/gram-seed.jpg', caption: 'Gram (chickpea) seeds', author: '\u05d0\u05d9\u05ea\u05df \u05e4\u05e8\u05de\u05df', licence: 'Public domain', licenceUrl: null, page: 'https://commons.wikimedia.org/wiki/File:Chickpea_grains.jpg' },
  'hibiscus': { id: 'hibiscus', src: '/lab/photos/hibiscus.jpg', caption: 'Hibiscus flower', author: 'B.navez', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0', page: 'https://commons.wikimedia.org/wiki/File:Hibiscus_rosa-sinensis_flower_2.JPG' },
  'hydra': { id: 'hydra', src: '/lab/photos/hydra.jpg', caption: 'Hydra with a bud (stained)', author: 'The Other 95%', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0', page: 'https://commons.wikimedia.org/wiki/File:Hydra_with_bud.jpg' },
  'onion-peel': { id: 'onion-peel', src: '/lab/photos/onion-peel.jpg', caption: 'Onion epidermis cells', author: 'loganrickert', licence: 'CC BY 2.0', licenceUrl: 'https://creativecommons.org/licenses/by/2.0', page: 'https://commons.wikimedia.org/wiki/File:Onion_Epidermis_Cells_W.M._40x_-_109.jpg' },
  'spirogyra': { id: 'spirogyra', src: '/lab/photos/spirogyra.jpg', caption: 'Spirogyra filament, spiral chloroplasts', author: 'Iceclanl', licence: 'CC BY-SA 3.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0', page: 'https://commons.wikimedia.org/wiki/File:Spirogyra_Under_Light_Microscope_40_X_Mag.jpg' },
  'starfish': { id: 'starfish', src: '/lab/photos/starfish.jpg', caption: 'Starfish', author: 'Herbythyme', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0', page: 'https://commons.wikimedia.org/wiki/File:Common_starfish_-_torbay.jpg' },
  'stomata': { id: 'stomata', src: '/lab/photos/stomata.jpg', caption: 'Leaf epidermis with stomata, light microscope', author: 'Emilio Ermini', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0', page: 'https://commons.wikimedia.org/wiki/File:Leaf_epithelium,_stomata.jpg' },
  'striated-muscle': { id: 'striated-muscle', src: '/lab/photos/striated-muscle.jpg', caption: 'Striated (skeletal) muscle, stained section', author: 'Nephron', licence: 'CC BY-SA 3.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0', page: 'https://commons.wikimedia.org/wiki/File:Skeletal_striated_muscle.jpg' },
  'yeast': { id: 'yeast', src: '/lab/photos/yeast.jpg', caption: 'Yeast cells, some budding (DIC microscope)', author: 'Masur', licence: 'Public domain', licenceUrl: null, page: 'https://commons.wikimedia.org/wiki/File:S_cerevisiae_under_DIC_microscopy.jpg' },
};

/** 'Photo: author, licence (Wikimedia Commons)' */
export const credit = (p: Photo) => `Photo: ${p.author}, ${p.licence} (Wikimedia Commons)`;
