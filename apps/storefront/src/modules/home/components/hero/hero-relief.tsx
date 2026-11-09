import { useId } from "react"

/** Wide, asymmetric blue contours. The background is entirely vector geometry. */
export default function HeroRelief() {
  const gradient = `hero-relief-${useId().replace(/:/g, "")}`
  return <svg className="texno-hero-relief" viewBox="0 0 1900 900" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={gradient} x1="500" y1="780" x2="1700" y2="130" gradientUnits="userSpaceOnUse">
        <stop stopColor="#1884d5" stopOpacity=".7" />
        <stop offset=".5" stopColor="#2089da" stopOpacity=".85" />
        <stop offset="1" stopColor="#1680d1" stopOpacity=".65" />
      </linearGradient>
    </defs>
    <g fill="none" stroke={`url(#${gradient})`} strokeLinecap="round">
      <path strokeWidth="68" d="M1630-85C1450 130 1350 125 1155 135C890 148 990 407 818 485C632 570 505 610 655 707C895 862 1284 953 1602 796C1904 646 2055 391 1884 195C1747 38 1587 268 1330 260C1095 253 1086 441 991 527C869 636 740 658 943 733C1159 813 1502 808 1664 643C1811 494 1712 352 1560 391" />
      <path strokeWidth="48" opacity=".6" d="M-110 785C86 525 235 715 430 767C697 838 982 1008 1323 945M1915 542C1713 682 1729 820 1442 871C1194 915 903 804 733 743C514 664 776 603 872 532C997 439 921 333 1105 248C1304 156 1510 306 1749 136C1856 60 1956 102 2015 155" />
      <path strokeWidth="36" opacity=".5" d="M1940 657C1728 753 1675 916 1420 935M1852-50C1670 83 1640 156 1467 194C1307 230 1189 161 1081 216C933 292 1018 404 878 491M1167 707C1314 761 1520 741 1596 635C1697 494 1602 430 1501 460" />
    </g>
  </svg>
}
