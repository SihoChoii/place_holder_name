import type { CatalogStar } from './types.js';

const DEGREE_TO_RADIANS = Math.PI / 180;
const NON_WORD = '[^\\p{L}\\p{N}_]';

function escapedRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class CatalogIndex {
  private readonly byId: ReadonlyMap<number, CatalogStar>;
  private readonly byName: ReadonlyMap<string, CatalogStar>;
  private readonly stars: readonly CatalogStar[];

  constructor(stars: readonly CatalogStar[]) {
    this.stars = [...stars];
    this.byId = new Map(this.stars.map((star) => [star.hyg_id, star]));
    this.byName = new Map(this.stars.map((star) => [star.name.toLowerCase(), star]));
  }

  get(id: number): CatalogStar | undefined {
    return this.byId.get(id);
  }

  findByName(name: string): CatalogStar | undefined {
    return this.byName.get(name.toLowerCase());
  }

  namesIn(text: string): CatalogStar[] {
    return this.stars.filter((star) => {
      if (star.name.length === 0) return false;
      const matcher = new RegExp(`(?:^|${NON_WORD})${escapedRegex(star.name)}(?=$|${NON_WORD})`, 'iu');
      return matcher.test(text);
    });
  }

  brightest(ids: Iterable<number>, n: number): CatalogStar[] {
    const requested = new Set(ids);
    const count = Math.max(0, Math.floor(n));
    return this.stars
      .filter((star) => requested.has(star.hyg_id))
      .sort((left, right) => left.mag - right.mag || left.hyg_id - right.hyg_id)
      .slice(0, count);
  }

  near(
    centerId: number,
    radiusDeg: number,
    magLimit: number,
    allow: (id: number) => boolean = () => true,
    max = 4,
  ): Array<{ star: CatalogStar; separation_deg: number }> {
    const center = this.byId.get(centerId);
    if (center === undefined || !Number.isFinite(radiusDeg) || !Number.isFinite(magLimit)) return [];
    const count = Math.max(0, Math.floor(max));
    if (count === 0) return [];

    const centerRightAscension = center.ra_deg * DEGREE_TO_RADIANS;
    const centerDeclination = center.dec_deg * DEGREE_TO_RADIANS;
    const candidates: Array<{ star: CatalogStar; separation: number }> = [];

    for (const star of this.stars) {
      if (star.hyg_id === centerId || star.mag > magLimit || !allow(star.hyg_id)) continue;
      const rightAscension = star.ra_deg * DEGREE_TO_RADIANS;
      const declination = star.dec_deg * DEGREE_TO_RADIANS;
      const cosine = Math.sin(centerDeclination) * Math.sin(declination)
        + Math.cos(centerDeclination) * Math.cos(declination) * Math.cos(centerRightAscension - rightAscension);
      const separation = Math.acos(Math.max(-1, Math.min(1, cosine))) / DEGREE_TO_RADIANS;
      if (separation <= radiusDeg) candidates.push({ star, separation });
    }

    return candidates
      .sort((left, right) => left.separation - right.separation || left.star.hyg_id - right.star.hyg_id)
      .slice(0, count)
      .map(({ star, separation }) => ({ star, separation_deg: Number(separation.toFixed(1)) }));
  }

  get hasExoplanets(): boolean {
    return this.stars.some((star) => (star.exoplanets?.length ?? 0) > 0);
  }

  get all(): readonly CatalogStar[] {
    return this.stars;
  }
}
