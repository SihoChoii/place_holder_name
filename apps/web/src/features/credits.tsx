import {
  CATALOG_ATTRIBUTION,
  CATALOG_LICENSE,
  CATALOG_VERSION,
} from "@/lib/star-catalog";
export function CreditsContent() {
  return (
    <div className="source-content">
      <p>
        8,920 stars from HYG v4.4, magnitude 6.5 and brighter. Catalog version:{" "}
        {CATALOG_VERSION}. Source positions use J2000; 205 distances are
        unknown.
      </p>
      <ul>
        {CATALOG_ATTRIBUTION.map((source) => (
          <li key={source.name}>
            <a href={source.href} target="_blank" rel="noreferrer">
              {source.name}
            </a>
            <span>
              {source.author} · {source.license}
            </span>
          </li>
        ))}
        <li>
          <a
            href="https://exoplanetarchive.ipac.caltech.edu/"
            target="_blank"
            rel="noreferrer"
          >
            NASA Exoplanet Archive
          </a>
          <span>
            NExScI · Planetary Systems Composite Parameters; planet hosts and
            measured stellar properties.
          </span>
        </li>
        <li>
          <a href="https://www.wikidata.org/" target="_blank" rel="noreferrer">
            Wikidata
          </a>
          <span>CC0 · HIP-to-Wikipedia title mapping.</span>
        </li>
        <li>
          <a
            href="https://www.naturalearthdata.com/about/terms-of-use/"
            target="_blank"
            rel="noreferrer"
          >
            Natural Earth
          </a>
          <span>Public domain · 1:110m land outlines for the Earth globe.</span>
        </li>
        <li>
          <a href="https://rsms.me/inter/" target="_blank" rel="noreferrer">
            Inter
          </a>
          <span>Rasmus Andersson · SIL Open Font License, self-hosted.</span>
        </li>
        <li>
          <a
            href="https://aa.usno.navy.mil/faq/GAST"
            target="_blank"
            rel="noreferrer"
          >
            U.S. Naval Observatory
          </a>
          <span>
            Sidereal time, altitude/azimuth, and approximate solar coordinates.
            J2000 precession uses IAU 1976 formulae.
          </span>
        </li>
      </ul>
      <p>
        The derived HYG dataset and constellation geometry are shared under{" "}
        <a href={CATALOG_LICENSE.href} target="_blank" rel="noreferrer">
          {CATALOG_LICENSE.name}
        </a>
        . The sky is drawn locally from catalog positions and the current device
        time. Refraction, proper motion, Moon, planets, and atmospheric effects
        are not included.
      </p>
      <p>
        Temperatures, radii, masses and gravity are labeled estimated where
        indicated by the catalog. Estimates can differ substantially from
        measured values. HYG luminosity is visual-band, not bolometric.
      </p>
      <p>
        Preset viewpoints are approximate locations: Starbase/Boca Chica (
        <a href="https://www.faa.gov/space/stakeholder_engagement/spacex_starship">
          FAA
        </a>
        ), Greenwich (
        <a href="https://web.astronomicalheritage.net/index.php/show-entity?identity=000034&idsubentity=1">
          IAU/UNESCO Astronomy Heritage
        </a>
        ), and Paranal (
        <a href="https://www.hq.eso.org/sci/facilities/paranal/astroclimate/site.html">
          ESO
        </a>
        ). The rectangular globe viewfinder is a schematic of camera heading and
        field of view, not a geographic footprint.
      </p>
    </div>
  );
}
