// Country flags beside player names. The match data mixes IOC codes (GER, SUI,
// NED) with ISO-3166 alpha-3 codes (PRT, URY, ZWE), so both map to the ISO
// alpha-2 code the flag set is keyed on. Defunct countries (USSR, Yugoslavia,
// Netherlands Antilles) have no flag in the set and fall back to the code.

const FLAG_URLS = import.meta.glob("/node_modules/flag-icons/flags/4x3/*.svg", {
  query: "?url",
  import: "default",
  eager: true,
});

const TO_ISO2 = {
  ALG: "dz", AND: "ad", ANT: "ag", ARG: "ar", ARM: "am", ARU: "aw", ATG: "ag", AUS: "au", AUT: "at", AZE: "az",
  BAH: "bs", BAN: "bd", BAR: "bb", BDI: "bi", BEL: "be", BEN: "bj", BER: "bm", BFA: "bf", BIH: "ba", BLR: "by",
  BOL: "bo", BRA: "br", BRN: "bh", BUL: "bg", BWA: "bw", CAN: "ca", CGO: "cg", CHI: "cl", CHN: "cn", CIV: "ci",
  CMR: "cm", COD: "cd", COK: "ck", COL: "co", CRC: "cr", CRO: "hr", CUB: "cu", CUR: "cw", CYP: "cy", CZE: "cz",
  DEN: "dk", DOM: "do", ECU: "ec", EGY: "eg", ESA: "sv", ESP: "es", EST: "ee", FIJ: "fj", FIN: "fi", FRA: "fr",
  GAB: "ga", GBR: "gb", GEO: "ge", GER: "de", GHA: "gh", GRE: "gr", GUA: "gt", GUM: "gu", HAI: "ht", HKG: "hk",
  HUN: "hu", INA: "id", IND: "in", IRI: "ir", IRL: "ie", IRQ: "iq", ISR: "il", ITA: "it", JAM: "jm", JOR: "jo",
  JPN: "jp", KAZ: "kz", KEN: "ke", KGZ: "kg", KOR: "kr", KOS: "xk", KSA: "sa", KUW: "kw", LAT: "lv", LBA: "ly",
  LBN: "lb", LIB: "lb", LKA: "lk", LTU: "lt", LUX: "lu", MAD: "mg", MAR: "ma", MAS: "my", MCO: "mc", MDA: "md",
  MEX: "mx", MHL: "mh", MKD: "mk", MLI: "ml", MLT: "mt", MNE: "me", MON: "mc", MUS: "mu", NAM: "na", NCL: "nc",
  NED: "nl", NGA: "ng", NGR: "ng", NIG: "ne", NMI: "mp", NOR: "no", NZL: "nz", OMA: "om", PAK: "pk", PAN: "pa",
  PAR: "py", PER: "pe", PHI: "ph", PNG: "pg", POL: "pl", POR: "pt", PRI: "pr", PRT: "pt", PRY: "py", PUR: "pr",
  QAT: "qa", ROU: "ro", RSA: "za", RUS: "ru", RWA: "rw", SAM: "ws", SDN: "sd", SEN: "sn", SGP: "sg", SIN: "sg",
  SLE: "sl", SLO: "si", SMR: "sm", SOL: "sb", SRB: "rs", SRI: "lk", SUI: "ch", SUR: "sr", SVK: "sk", SVN: "si",
  SWE: "se", SYR: "sy", TGO: "tg", THA: "th", TJK: "tj", TKM: "tm", TOG: "tg", TPE: "tw", TRI: "tt", TUN: "tn",
  TUR: "tr", TWN: "tw", UAE: "ae", UGA: "ug", UKR: "ua", URU: "uy", URY: "uy", USA: "us", UZB: "uz", VAN: "vu",
  VEN: "ve", VIE: "vn", VNM: "vn", ZAM: "zm", ZIM: "zw", ZWE: "zw",
};

function flagUrl(ioc) {
  const iso2 = ioc && TO_ISO2[ioc.toUpperCase()];
  return iso2 ? FLAG_URLS[`/node_modules/flag-icons/flags/4x3/${iso2}.svg`] : null;
}

// size is the flag height in px; width follows the 4:3 ratio.
export function Flag({ ioc, size = 12, className = "" }) {
  if (!ioc) return null;
  const url = flagUrl(ioc);
  if (!url) {
    return <span className={`caps text-fog ${className}`}>{ioc}</span>;
  }
  return (
    <img
      src={url}
      alt=""
      title={ioc}
      width={Math.round((size * 4) / 3)}
      height={size}
      loading="lazy"
      className={`inline-block shrink-0 rounded-[1px] object-cover ring-1 ring-rule ${className}`}
      style={{ width: Math.round((size * 4) / 3), height: size }}
    />
  );
}
