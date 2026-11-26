import type { HazardType, HotspotSeed } from "./hotspots";
import type { RiskLevel } from "./risk";

export type Lang = "mr" | "en" | "hi";

export const LANG_LABELS: Record<Lang, string> = {
  mr: "मराठी",
  en: "EN",
  hi: "हिंदी",
};

export interface Translations {
  appName: string;
  tagline: string;
  alertHighSevere: string;
  cityJumpLabel: string;
  allMaharashtra: string;
  tabRisk: string;
  tabReport: string;
  tabRoute: string;
  tabPrecautions: string;
  riskLow: string;
  riskMedium: string;
  riskHigh: string;
  riskSevere: string;
  hazardUrban: string;
  hazardRiver: string;
  hazardLandslide: string;
  stateWatchTitle: string;
  regionalBreakdownTitle: string;
  cityRiskTitle: string;
  currentRain: string;
  next6hRain: string;
  precipProb: string;
  simulateRainInLabel: string;
  simulateOff: string;
  simulateAllRegions: string;
  forecastChartTitle: string;
  topRiskiestAreas: string;
  weatherLoading: string;
  weatherError: string;
  retry: string;
  lastUpdated: string;
  legendTitle: string;
  yourLocation: string;
  clusterLabel: string;
  zoomInHint: string;
  reportTitle: string;
  reportSubtitle: string;
  takeOrUploadPhoto: string;
  useMyGps: string;
  pickOnMap: string;
  pickingOnMapHint: string;
  selectedCoords: string;
  analyzeAndSubmit: string;
  analyzingPhoto: string;
  demoModeLabel: string;
  verifiedBadge: string;
  unverifiedBadge: string;
  recentReports: string;
  noReportsYet: string;
  reportZoneLabel: string;
  routeTitle: string;
  sourceLabel: string;
  destinationLabel: string;
  myCurrentLocation: string;
  searchDestinationPlaceholder: string;
  pickSourceOnMap: string;
  pickDestOnMap: string;
  findSafeRoute: string;
  findingRoute: string;
  distanceLabel: string;
  etaLabel: string;
  avoidedCountLabel: string;
  allRoutesFloodedWarning: string;
  noRouteYet: string;
  precautionsTitle: string;
  currentRiskAdvice: string;
  dosTitle: string;
  dontsTitle: string;
  riverFloodTitle: string;
  riverFloodAdvice: string[];
  landslideTitle: string;
  landslideAdvice: string[];
  emergencyContacts: string;
  stateDisaster: string;
  ndrf: string;
  bmcDisaster: string;
  police: string;
  fireBrigade: string;
  dosByRisk: Record<RiskLevel, string[]>;
  dontsByRisk: Record<RiskLevel, string[]>;
}

export const I18N: Record<Lang, Translations> = {
  mr: {
    appName: "FloodLoop AI",
    tagline: "महाराष्ट्र पूर व सुरक्षित मार्ग AI",
    alertHighSevere: "तीव्र पाणी साचणे / पूर शक्यता, हे भाग टाळा:",
    cityJumpLabel: "शहर निवडा",
    allMaharashtra: "संपूर्ण महाराष्ट्र",
    tabRisk: "धोका",
    tabReport: "तक्रार",
    tabRoute: "सुरक्षित मार्ग",
    tabPrecautions: "खबरदारी",
    riskLow: "कमी",
    riskMedium: "मध्यम",
    riskHigh: "जास्त",
    riskSevere: "अतिगंभीर",
    hazardUrban: "शहरी पाणी साचणे",
    hazardRiver: "नदी पूर धोका",
    hazardLandslide: "घाट दरड धोका",
    stateWatchTitle: "महाराष्ट्र पूर निरीक्षण",
    regionalBreakdownTitle: "विभागवार स्थिती",
    cityRiskTitle: "शहर कमाल धोका",
    currentRain: "सध्याचा पाऊस",
    next6hRain: "पुढील ६ तास",
    precipProb: "पावसाची शक्यता",
    simulateRainInLabel: "मुसळधार पाऊस सिम्युलेशन:",
    simulateOff: "बंद (थेट हवामान)",
    simulateAllRegions: "सर्व विभाग",
    forecastChartTitle: "पुढील ६ तासांचा पाऊस (mm)",
    topRiskiestAreas: "राज्यातील सर्वाधिक धोक्याची ५ ठिकाणे",
    weatherLoading: "महाराष्ट्राचे थेट हवामान लोड होत आहे...",
    weatherError: "थेट हवामान लोड होऊ शकले नाही.",
    retry: "पुन्हा प्रयत्न",
    lastUpdated: "अपडेट",
    legendTitle: "धोका पातळी",
    yourLocation: "तुमचे GPS",
    clusterLabel: "केंद्र (झूम करा)",
    zoomInHint: "तपशीलासाठी झूम करा किंवा शहर निवडा",
    reportTitle: "पाणी साचल्याची तक्रार करा",
    reportSubtitle: "पुराची खात्री करण्यासाठी रस्त्याचा फोटो अपलोड करा",
    takeOrUploadPhoto: "फोटो काढा किंवा अपलोड करा",
    useMyGps: "माझे GPS वापरा",
    pickOnMap: "नकाशावर निवडा",
    pickingOnMapHint: "ठिकाण निवडण्यासाठी नकाशावर टॅप करा",
    selectedCoords: "ठिकाण",
    analyzeAndSubmit: "AI तपासणी व सबमिट करा",
    analyzingPhoto: "AI फोटो तपासत आहे...",
    demoModeLabel: "डेमो मोड",
    verifiedBadge: "सत्यापित",
    unverifiedBadge: "प्रलंबित (२+ तक्रारी आवश्यक)",
    recentReports: "नागरिकांच्या तक्रारी",
    noReportsYet: "अद्याप तक्रारी नाहीत. तक्रार करण्यासाठी वर टॅप करा.",
    reportZoneLabel: "300m पूर क्षेत्र",
    routeTitle: "सुरक्षित मार्ग शोधक",
    sourceLabel: "सुरुवात",
    destinationLabel: "गंतव्य",
    myCurrentLocation: "माझे ठिकाण (GPS)",
    searchDestinationPlaceholder: "महाराष्ट्रातील ठिकाण शोधा (उदा. पुणे, दादर)...",
    pickSourceOnMap: "सुरुवात निवडा",
    pickDestOnMap: "गंतव्य निवडा",
    findSafeRoute: "सुरक्षित मार्ग शोधा",
    findingRoute: "सुरक्षित मार्ग शोधत आहे...",
    distanceLabel: "अंतर",
    etaLabel: "अंदाजित वेळ",
    avoidedCountLabel: "टाळलेले धोकादायक मार्ग",
    allRoutesFloodedWarning:
      "इशारा: सर्व उपलब्ध मार्ग पूरग्रस्त भागातून जातात. सर्वात कमी धोक्याचा मार्ग दाखवला आहे.",
    noRouteYet: "सुरक्षित मार्ग पाहण्यासाठी गंतव्य टाका किंवा नकाशावर निवडा.",
    precautionsTitle: "AI सुरक्षा खबरदारी",
    currentRiskAdvice: "सध्याच्या धोक्यासाठी सूचना",
    dosTitle: "काय करावे",
    dontsTitle: "काय करू नये",
    riverFloodTitle: "नदी पूर खबरदारी (कृष्णा, पंचगंगा, गोदावरी, वशिष्ठी)",
    riverFloodAdvice: [
      "धरण विसर्ग आणि नदी पातळीच्या इशाऱ्याकडे लक्ष ठेवा; पाणी वेगाने वाढू शकते.",
      "पूल किंवा कॉजवेवरून पाणी वाहत असल्यास वाहन नेऊ नका.",
      "तात्काळ कागदपत्रे, औषधे व पिण्याचे पाणी उंच ठिकाणी हलवा.",
    ],
    landslideTitle: "घाट व दरड कोसळण्याची खबरदारी (ताम्हिणी, कसारा, आंबोली, कशेडी)",
    landslideAdvice: [
      "मुसळधार पावसात रात्रीचा घाट प्रवास टाळा.",
      "रस्त्यावर माती, लहान दगड किंवा गढूळ झरे दिसल्यास त्वरित परत फिरा.",
      "धुक्यात हेडलाईट लो-बीमवर ठेवा आणि दरडीखाली वाहन थांबवू नका.",
    ],
    emergencyContacts: "महाराष्ट्र आपत्कालीन क्रमांक",
    stateDisaster: "राज्य आपत्ती नियंत्रण",
    ndrf: "NDRF हेल्पलाइन",
    bmcDisaster: "मुंबई BMC",
    police: "पोलीस",
    fireBrigade: "अग्निशमन",
    dosByRisk: {
      low: [
        "पावसाळ्यात बाहेर पडण्यापूर्वी थेट धोका पातळी तपासा.",
        "फोनसाठी पॉवर बँक आणि वॉटरप्रूफ पाऊच सोबत ठेवा.",
        "धरण विसर्ग व हवामान अपडेट तपासा.",
      ],
      medium: [
        "उड्डाणपूल आणि एक्सप्रेस हायवेचा वापर करा.",
        "फोनची बॅटरी ५०% पेक्षा जास्त ठेवा आणि कुटुंबाला लोकेशन कळवा.",
        "प्रवासासाठी २०–३० मिनिटे अतिरिक्त वेळ ठेवा.",
      ],
      high: [
        "सबवे, नदीकाठचे पूल आणि सखल भाग टाळा.",
        "वाहन उंच ठिकाणी पार्क करा.",
        "प्रशासनाच्या सूचनांचे पालन करा आणि आपत्कालीन क्रमांक जवळ ठेवा.",
      ],
      severe: [
        "अत्यावश्यक नसल्यास घराबाहेर पडू नका.",
        "तळमजल्यावर पाणी शिरल्यास वरच्या मजल्यावर जा.",
        "अडकल्यास तात्काळ 112 किंवा 1070 वर संपर्क साधा.",
      ],
    },
    dontsByRisk: {
      low: [
        "भरती आणि मुसळधार पावसाच्या अचानक इशाऱ्याकडे दुर्लक्ष करू नका.",
        "पावसाळी गटारांच्या झाकणांवर वाहन पार्क करू नका.",
      ],
      medium: [
        "पाणी साचलेल्या अंडरपासमध्ये प्रवेश नका.",
        "अफवांवर विश्वास ठेवू नका.",
      ],
      high: [
        "चाकांच्या पातळीपेक्षा जास्त पाण्यात वाहन चालवू नका.",
        "पडलेल्या विजेच्या खांबांजवळ किंवा उघड्या मॅनहोलजवळ जाऊ नका.",
      ],
      severe: [
        "पाणी साचलेले सबवे किंवा वेगवान पाण्याचा प्रवाह ओलांडण्याचा प्रयत्न करू नका.",
        "ओल्या विजेच्या स्विच किंवा उपकरणांना हात लावू नका.",
      ],
    },
  },
  en: {
    appName: "FloodLoop AI",
    tagline: "Maharashtra Flood & Safe Route AI",
    alertHighSevere: "Severe waterlogging / flood risk, avoid:",
    cityJumpLabel: "Jump to city",
    allMaharashtra: "All Maharashtra",
    tabRisk: "Risk",
    tabReport: "Report",
    tabRoute: "Safe Route",
    tabPrecautions: "Precautions",
    riskLow: "Low",
    riskMedium: "Medium",
    riskHigh: "High",
    riskSevere: "Severe",
    hazardUrban: "Urban Waterlogging",
    hazardRiver: "River Flood",
    hazardLandslide: "Ghat Landslide",
    stateWatchTitle: "Maharashtra Flood Watch",
    regionalBreakdownTitle: "Regional Breakdown",
    cityRiskTitle: "City Peak Risk",
    currentRain: "Current Rain",
    next6hRain: "Next 6h Rain",
    precipProb: "Rain Chance",
    simulateRainInLabel: "Simulate heavy rain in:",
    simulateOff: "Off (Live Weather)",
    simulateAllRegions: "All Regions",
    forecastChartTitle: "Next 6-Hour Rainfall Forecast (mm)",
    topRiskiestAreas: "Top 5 Riskiest Areas Statewide",
    weatherLoading: "Fetching live Maharashtra weather...",
    weatherError: "Unable to load live weather. Showing fallback.",
    retry: "Retry",
    lastUpdated: "Updated",
    legendTitle: "Risk Legend",
    yourLocation: "Your GPS",
    clusterLabel: "Cluster (zoom in)",
    zoomInHint: "Zoom in or pick a city for hotspot details",
    reportTitle: "Report Waterlogging",
    reportSubtitle: "Upload a street photo to verify flooding & warn commuters",
    takeOrUploadPhoto: "Capture or Upload Photo",
    useMyGps: "Use My GPS",
    pickOnMap: "Pin on Map",
    pickingOnMapHint: "Tap anywhere on the map to set location",
    selectedCoords: "Location",
    analyzeAndSubmit: "Analyze & Submit Report",
    analyzingPhoto: "Analyzing photo with AI...",
    demoModeLabel: "Demo mode",
    verifiedBadge: "Verified",
    unverifiedBadge: "Pending (needs 2+ reports)",
    recentReports: "Shared Community Reports",
    noReportsYet: "No flood reports yet. Tap above to report waterlogging.",
    reportZoneLabel: "300m Flood Zone",
    routeTitle: "Safe Route Finder",
    sourceLabel: "Source",
    destinationLabel: "Destination",
    myCurrentLocation: "My Location (GPS)",
    searchDestinationPlaceholder: "Search Maharashtra (e.g. Pune, Dadar, Nashik)...",
    pickSourceOnMap: "Pick Source",
    pickDestOnMap: "Pick Dest",
    findSafeRoute: "Find Safe Route",
    findingRoute: "Calculating flood-free route...",
    distanceLabel: "Distance",
    etaLabel: "ETA",
    avoidedCountLabel: "Hazard zones avoided",
    allRoutesFloodedWarning:
      "Warning: All available routes pass through active hazard zones. Showing the least risky route.",
    noRouteYet: "Enter a destination or pick on map to compute a flood-safe route.",
    precautionsTitle: "AI Safety Precautions",
    currentRiskAdvice: "Guidance for current risk",
    dosTitle: "Do's",
    dontsTitle: "Don'ts",
    riverFloodTitle: "River Flood Safety (Krishna, Panchganga, Godavari, Vashishti)",
    riverFloodAdvice: [
      "Monitor upstream dam discharge alerts; river levels rise hours after rain.",
      "Never drive across submerged bridges or overflowing causeways.",
      "Move documents, medicines, and drinking water to upper floors early.",
    ],
    landslideTitle: "Ghat Landslide Safety (Tamhini, Kasara, Amboli, Kashedi)",
    landslideAdvice: [
      "Avoid night travel through Sahyadri ghats during red/orange rain alerts.",
      "Turn back immediately if you spot mudflows, falling pebbles, or muddy streams.",
      "Do not park under steep rock cuts; keep headlights on low beam in fog.",
    ],
    emergencyContacts: "Maharashtra Emergency Helplines",
    stateDisaster: "State Disaster Control",
    ndrf: "NDRF Helpline",
    bmcDisaster: "Mumbai BMC",
    police: "Police",
    fireBrigade: "Fire Brigade",
    dosByRisk: {
      low: [
        "Check live FloodLoop risk before leaving during monsoon.",
        "Keep a power bank and waterproof pouch for your phone.",
        "Track dam release and IMD alerts for river basins.",
      ],
      medium: [
        "Prefer elevated flyovers and express highways.",
        "Keep phone charged above 50% and share live ETA with family.",
        "Allow extra 20–30 minutes for slow-moving traffic.",
      ],
      high: [
        "Avoid subways, low river bridges, and waterlogged junctions.",
        "Park vehicles on higher ground away from open drains.",
        "Follow district advisories and keep emergency numbers handy.",
      ],
      severe: [
        "Stay indoors unless travel is strictly essential.",
        "Move to upper floors if water enters ground-level premises.",
        "Call State Disaster Control (112 / 1070) if stranded or in danger.",
      ],
    },
    dontsByRisk: {
      low: [
        "Don't ignore sudden high-tide + heavy rain alerts.",
        "Don't park directly over storm-water drain grates.",
      ],
      medium: [
        "Don't enter underpasses with visible ankle-deep water.",
        "Don't rely on unverified social media rumours.",
      ],
      high: [
        "Don't drive or ride through standing water above wheel-hub level.",
        "Don't walk near fallen electric poles or open manholes.",
      ],
      severe: [
        "Don't attempt to cross flooded subways or fast-flowing water.",
        "Don't touch wet electrical switches or submerged appliances.",
      ],
    },
  },
  hi: {
    appName: "FloodLoop AI",
    tagline: "महाराष्ट्र बाढ़ और सुरक्षित मार्ग AI",
    alertHighSevere: "भारी जलभराव / बाढ़ की संभावना, इन क्षेत्रों से बचें:",
    cityJumpLabel: "शहर चुनें",
    allMaharashtra: "संपूर्ण महाराष्ट्र",
    tabRisk: "जोखिम",
    tabReport: "रिपोर्ट",
    tabRoute: "सुरक्षित मार्ग",
    tabPrecautions: "सावधानियाँ",
    riskLow: "कम",
    riskMedium: "मध्यम",
    riskHigh: "उच्च",
    riskSevere: "गंभीर",
    hazardUrban: "शहरी जलभराव",
    hazardRiver: "नदी बाढ़ जोखिम",
    hazardLandslide: "घाट भूस्खलन जोखिम",
    stateWatchTitle: "महाराष्ट्र बाढ़ निगरानी",
    regionalBreakdownTitle: "क्षेत्रीय स्थिति",
    cityRiskTitle: "शहर अधिकतम जोखिम",
    currentRain: "वर्तमान बारिश",
    next6hRain: "अगले 6 घंटे",
    precipProb: "बारिश संभावना",
    simulateRainInLabel: "भारी बारिश सिमुलेशन:",
    simulateOff: "बंद (लाइव मौसम)",
    simulateAllRegions: "सभी क्षेत्र",
    forecastChartTitle: "अगले 6 घंटे की बारिश (mm)",
    topRiskiestAreas: "राज्य के शीर्ष 5 जोखिम वाले क्षेत्र",
    weatherLoading: "महाराष्ट्र का लाइव मौसम लोड हो रहा है...",
    weatherError: "लाइव मौसम लोड नहीं हो सका।",
    retry: "पुनः प्रयास",
    lastUpdated: "अपडेट",
    legendTitle: "जोखिम स्तर",
    yourLocation: "आपका GPS",
    clusterLabel: "समूह (ज़ूम करें)",
    zoomInHint: "विस्तार देखने के लिए ज़ूम करें या शहर चुनें",
    reportTitle: "जलभराव की रिपोर्ट करें",
    reportSubtitle: "बाढ़ की पुष्टि के लिए सड़क की फोटो अपलोड करें",
    takeOrUploadPhoto: "फोटो खींचें या अपलोड करें",
    useMyGps: "मेरा GPS उपयोग करें",
    pickOnMap: "मैप पर चुनें",
    pickingOnMapHint: "स्थान चुनने के लिए मैप पर टैप करें",
    selectedCoords: "स्थान",
    analyzeAndSubmit: "AI से जांचें और सबमिट करें",
    analyzingPhoto: "AI फोटो की जांच कर रहा है...",
    demoModeLabel: "डेमो मोड",
    verifiedBadge: "सत्यापित",
    unverifiedBadge: "लंबित (2+ रिपोर्ट आवश्यक)",
    recentReports: "साझा समुदाय रिपोर्ट",
    noReportsYet: "अभी तक कोई रिपोर्ट नहीं। रिपोर्ट करने के लिए ऊपर टैप करें।",
    reportZoneLabel: "300m बाढ़ क्षेत्र",
    routeTitle: "सुरक्षित मार्ग खोजक",
    sourceLabel: "प्रारंभ स्थान",
    destinationLabel: "गंतव्य",
    myCurrentLocation: "मेरा स्थान (GPS)",
    searchDestinationPlaceholder: "महाराष्ट्र स्थान खोजें (जैसे पुणे, दादर)...",
    pickSourceOnMap: "प्रारंभ चुनें",
    pickDestOnMap: "गंतव्य चुनें",
    findSafeRoute: "सुरक्षित मार्ग खोजें",
    findingRoute: "सुरक्षित मार्ग निकाला जा रहा है...",
    distanceLabel: "दूरी",
    etaLabel: "समय",
    avoidedCountLabel: "बचे हुए जोखिम मार्ग",
    allRoutesFloodedWarning:
      "चेतावनी: सभी उपलब्ध मार्ग बाढ़ क्षेत्रों से गुजरते हैं। सबसे कम जोखिम वाला मार्ग दिखाया गया है।",
    noRouteYet: "सुरक्षित मार्ग देखने के लिए गंतव्य दर्ज करें या मैप पर चुनें।",
    precautionsTitle: "AI सुरक्षा सावधानियाँ",
    currentRiskAdvice: "वर्तमान जोखिम के लिए सलाह",
    dosTitle: "क्या करें",
    dontsTitle: "क्या न करें",
    riverFloodTitle: "नदी बाढ़ सुरक्षा (कृष्णा, पंचगंगा, गोदावरी, वशिष्ठी)",
    riverFloodAdvice: [
      "बांध से पानी छोड़े जाने और नदी के स्तर की चेतावनी पर नजर रखें।",
      "डूब चुके पुलों या बहते पानी के ऊपर से वाहन न निकालें।",
      "जरूरी दस्तावेज, दवाइयां और पीने का पानी ऊपरी मंजिल पर रखें।",
    ],
    landslideTitle: "घाट भूस्खलन सुरक्षा (ताम्हिणी, कसारा, अंबोली, कशेडी)",
    landslideAdvice: [
      "भारी बारिश में रात के समय घाट मार्ग से यात्रा करने से बचें।",
      "सड़क पर मिट्टी, पत्थर या गंदा पानी बहता दिखे तो तुरंत वापस मुड़ें।",
      "खड़ी चट्टानों के नीचे वाहन न रोकें और कोहरे में लो-बीम लाइट रखें।",
    ],
    emergencyContacts: "महाराष्ट्र आपातकालीन नंबर",
    stateDisaster: "राज्य आपदा नियंत्रण",
    ndrf: "NDRF हेल्पलाइन",
    bmcDisaster: "मुंबई BMC",
    police: "पुलिस",
    fireBrigade: "फायर ब्रिगेड",
    dosByRisk: {
      low: [
        "मानसून में निकलने से पहले लाइव जोखिम जांचें।",
        "फोन के लिए पावर बैंक और वाटरप्रूफ पाउच रखें।",
        "बांध विसर्ग और मौसम अपडेट देखते रहें।",
      ],
      medium: [
        "फ्लाईओवर और एक्सप्रेस हाईवे का उपयोग करें।",
        "फोन की बैटरी 50% से ऊपर रखें और परिवार को लोकेशन भेजें।",
        "यात्रा के लिए 20–30 मिनट अतिरिक्त समय रखें।",
      ],
      high: [
        "सबवे, निचले नदी पुलों और जलभराव वाले इलाकों से बचें।",
        "वाहन को ऊंची जगह पर पार्क करें।",
        "प्रशासन की सलाह मानें और आपातकालीन नंबर पास रखें।",
      ],
      severe: [
        "जरूरी न हो तो घर के अंदर ही रहें।",
        "पानी भरने पर ऊपरी मंजिल पर चले जाएं।",
        "फंसने पर तुरंत 112 या 1070 पर कॉल करें।",
      ],
    },
    dontsByRisk: {
      low: [
        "अचानक हाई-टाइड और भारी बारिश की चेतावनी को अनदेखा न करें।",
        "स्टॉर्म वाटर ड्रेन के ऊपर वाहन पार्क न करें।",
      ],
      medium: [
        "पानी भरे अंडरपास में प्रवेश न करें।",
        "अपुष्ट अफवाहों पर भरोसा न करें।",
      ],
      high: [
        "गहरे पानी में गाड़ी न चलाएं।",
        "गिरे हुए बिजली के खंभों या खुले मैनहोल के पास न जाएं।",
      ],
      severe: [
        "बाढ़ वाले सबवे या तेज बहाव को पार करने की कोशिश न करें।",
        "गीले बिजली के स्विच या उपकरणों को न छुएं।",
      ],
    },
  },
};

export function riskLevelLabel(level: RiskLevel, t: Translations): string {
  switch (level) {
    case "low":
      return t.riskLow;
    case "medium":
      return t.riskMedium;
    case "high":
      return t.riskHigh;
    case "severe":
      return t.riskSevere;
  }
}

export function hotspotDisplayName(hotspot: HotspotSeed, lang: Lang): string {
  if (lang === "mr") return hotspot.nameMr || hotspot.name;
  if (lang === "hi") return hotspot.nameHi || hotspot.name;
  return hotspot.name;
}

export function hazardTypeLabel(type: HazardType, t: Translations): string {
  switch (type) {
    case "river_flood":
      return t.hazardRiver;
    default:
      return t.hazardUrban;
  }
}
