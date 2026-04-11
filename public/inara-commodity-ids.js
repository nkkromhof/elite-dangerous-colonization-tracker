// Maps lowercase EDCD commodity symbols to Inara.cz commodity IDs.
//
// The journal stores commodity internal names as "$Symbol_Name;" (e.g. "$FoodCartridges_Name;").
// Strip the leading "$" and trailing "_Name;" (case-insensitive), lowercase the result,
// and look up the Inara ID here.
//
// Sources:
//   EDCD symbols: https://raw.githubusercontent.com/EDCD/FDevIDs/master/commodity.csv
//   Inara IDs:    https://inara.cz/elite/commodities/ (form option values)

export const INARA_COMMODITY_IDS = {
  advancedcatalysers:            61,
  advancedmedicines:             166,
  agriculturalmedicines:         1,   // Agri-Medicines
  agronomictreatment:            10268,
  airelics:                      89,
  alexandrite:                   10249,
  algae:                         15,
  aluminium:                     37,
  usscargoancientartefact:       121,  // Ancient Artefact
  ancientkey:                    10240,
  animalmeat:                    16,
  animalmonitors:                62,
  p_particulatesample:           10270, // Anomaly Particles
  antimattercontainmentunit:     10167,
  antiquejewellery:              10209,
  antiquities:                   91,
  aquaponicsystems:              63,
  articulationmotors:            182,
  assaultplans:                  169,
  atmosphericextractors:         87,   // Atmospheric Processors
  autofabricators:               65,
  basicmedicines:                33,
  battleweapons:                 88,
  bauxite:                       51,
  beer:                          10,
  benitoite:                     10247,
  bertrandite:                   52,
  beryllium:                     38,
  bioreducinglichen:             66,
  biowaste:                      76,
  bismuth:                       106,
  usscargoblackbox:              122,  // Black Box
  thargoidbonefragments:         10456,
  bootlegliquor:                 95,
  bromellite:                    148,
  buildingfabricators:           102,
  thargoidgeneratortissuesample: 10439, // Caustic Tissue Sample
  ceramiccomposites:             100,
  chemicalwaste:                 32,
  clothing:                      7,
  cmmcomposite:                  140,
  cobalt:                        39,
  coffee:                        17,
  coltan:                        55,
  combatstabilisers:             34,
  comercialsamples:              170,  // Commercial Samples
  computercomponents:            67,
  conductivefabrics:             165,
  consumertechnology:            8,
  copper:                        40,
  coralsap:                      10451,
  cropharvesters:                29,
  cryolite:                      110,
  thargoidcystspecimen:          10459,
  damagedescapepod:              10215,
  datacore:                      10166,
  diplomaticbag:                 171,
  domesticappliances:            9,
  earthrelics:                   10210,
  emergencypowercells:           158,
  encryptedcorrespondence:       172,
  encripteddatastorage:          173,  // Encrypted Data Storage (EDCD typo)
  powergridassembly:             149,  // Energy Grid Assembly
  evacuationshelter:             99,
  exhaustmanifold:               159,
  usscargoexperimentalchemicals: 123,
  explosives:                    3,
  fish:                          18,
  foodcartridges:                19,
  fossilremnants:                10221,
  fruitandvegetables:            20,
  gallite:                       56,
  gallium:                       41,
  genebank:                      10211,
  geologicalequipment:           103,
  geologicalsamples:             174,
  gold:                          42,
  goslarite:                     111,
  grain:                         21,
  grandidierite:                 10248,
  ancientcasket:                 10153, // Guardian Casket
  ancientorb:                    10154, // Guardian Orb
  ancientrelic:                  10155, // Guardian Relic
  ancienttablet:                 10156, // Guardian Tablet
  ancienturn:                    10158, // Guardian Urn
  ancienttotem:                  10157, // Guardian Totem
  hazardousenvironmentsuits:     68,   // H.E. Suits
  haematite:                     10486,
  hafnium178:                    124,
  diagnosticsensor:              155,  // Hardware Diagnostic Sensor
  heatsinkinterlink:             151,
  hnshockmount:                  150,
  hostage:                       175,  // Hostages
  hydrogenfuel:                  4,
  hydrogenperoxide:              138,
  imperialslaves:                49,
  unknownmineral:                10452, // Impure Spire Mineral
  indite:                        57,
  indium:                        43,
  insulatingmembrane:            141,
  iondistributor:                160,
  jadeite:                       168,
  terrainenrichmentsystems:      71,   // Land Enrichment Systems
  landmines:                     118,
  lanthanum:                     107,
  largeexplorationdatacash:      125,  // Large Survey Data Cache
  leather:                       73,
  lepidolite:                    58,
  liquidoxygen:                  137,
  liquor:                        11,
  lithium:                       44,
  lithiumhydroxide:              147,
  lowtemperaturediomond:         144,  // Low Temperature Diamonds (EDCD: LowTemperatureDiamond)
  lowtemperaturediamond:         144,
  magneticemittercoil:           152,
  marinesupplies:                86,   // Marine Equipment
  medicaldiagnosticequipment:    154,
  metaalloys:                    101,
  methaneclathrate:              145,
  methanolmonohydratecrystals:   146,
  coolinghoses:                  185,  // Micro-weave Cooling Hoses
  heliostaticfurnaces:           85,   // Microbial Furnaces
  microcontrollers:              156,
  militarygradefabrics:          157,
  militaryintelligence:          126,
  usscargomilitaryplans:         127,
  mineralextractors:             31,
  mineraloil:                    5,
  modularterminals:              181,
  moissanite:                    116,
  m_tissuesample_nerves:         10256, // Mollusc Brain Tissue
  m_tissuesample_fluid:          10255, // Mollusc Fluid
  m3_tissuesample_membrane:      10252, // Mollusc Membrane
  m3_tissuesample_mycelium:      10253, // Mollusc Mycelium
  m_tissuesample_soft:           10254, // Mollusc Soft Tissue
  m3_tissuesample_spores:        10251, // Mollusc Spores
  monazite:                      10245,
  mutomimager:                   119,  // Muon Imager
  musgravite:                    10246,
  mysteriousidol:                10219,
  nanobreakers:                  167,
  basicnarcotics:                12,   // Narcotics
  naturalfabrics:                74,
  neofabricinsulation:           183,
  nerveagents:                   96,
  nonlethalweapons:              78,
  occupiedcryopod:               129,  // Occupied Escape Pod
  onionheadc:                    10435, // Onionhead Gamma Strain
  thargoidorgansample:           10458,
  osmium:                        72,
  painite:                       84,
  palladium:                     45,
  performanceenhancers:          35,
  personaleffects:               10159,
  personalweapons:               79,
  pesticides:                    6,
  platinum:                      81,
  s_tissuesample_cells:          10259, // Pod Core Tissue
  s_tissuesample_surface:        10257, // Pod Dead Tissue
  s6_tissuesample_mesoglea:      10262, // Pod Mesoglea
  s6_tissuesample_cells:         10260, // Pod Outer Tissue
  s6_tissuesample_coenosarc:     10261, // Pod Shell Tissue
  s_tissuesample_core:           10258, // Pod Surface Tissue
  s9_tissuesample_shell:         10263, // Pod Tissue
  politicalprisoner:             177,  // Political Prisoners
  polymers:                      26,
  powerconverter:                153,
  powergenerators:               83,
  powertransferconduits:         161,  // Power Transfer Bus
  praseodymium:                  143,
  preciousgems:                  10165,
  progenitatorcells:             36,   // (alternate spelling guard)
  progenitorcells:               36,
  prohibitedresearchmaterials:   10220,
  unknownsack:                   10449, // Protective Membrane Scrap
  usscargoprototypetch:          130,  // Prototype Tech (EDCD: USSCargoPrototypeTech)
  usscargoprototypetch:          130,
  pyrophyllite:                  112,
  radiationbaffle:               162,
  usscargoreartwork:             131,  // Rare Artwork (EDCD: USSCargoRareArtwork)
  usscargorareartwork:           131,
  reactivearmour:                80,
  usscargorebeltransmissions:    132,
  reinforcedmountingplate:       163,
  resonatingseparators:          69,
  rhodplumsite:                  10243,
  robotics:                      70,
  rockforthfertiliser:           10264,
  rutile:                        59,
  samarium:                      142,
  sap8corecontainer:             90,
  scientificresearch:            178,
  scientificsamples:             179,
  scrap:                         77,
  unknownrefinedmineral:         10453, // Semi-Refined Spire Mineral
  semiconductors:                28,
  serendibite:                   10244,
  silver:                        46,
  skimercomponents:              104,  // Skimmer Components (EDCD typo)
  slaves:                        53,
  smallexplorationdatacash:      10208, // Small Survey Data Cache
  spacepioneerrelics:            10164,
  steel:                         10487,
  structuralregulators:          117,
  superconductors:               27,
  surfacestabilisers:            97,
  survivalequipment:             164,
  syntheticfabrics:              75,
  syntheticmeat:                 23,
  syntheticreagents:             98,
  taaffeite:                     120,
  tacticaldata:                  180,
  tantalum:                      47,
  tea:                           22,
  usscargoechnicalblueprints:    133,  // (guard for typo)
  usscargotechnicalblueprints:   133,
  telemetrysuite:                184,
  thallium:                      108,
  thargoidtissuesampletype2:     10236, // Thargoid Basilisk Tissue Sample
  unknownbiologicalmatter:       10160, // Thargoid Biological Matter
  thargoidtissuesampletype1:     10234, // Thargoid Cyclops Tissue Sample
  thargoidtissuesampletype6:     10441, // Thargoid Glaive Tissue Sample
  thargoidheart:                 10235,
  thargoidheart:                 10235,
  thargoidtissuesampletype4:     10239, // Thargoid Hydra Tissue Sample
  unknownartifact3:              10161, // Thargoid Link
  thargoidtissuesampletype3:     10237, // Thargoid Medusa Tissue Sample
  thargoidtissuesampletype5:     10438, // Thargoid Orthrus Tissue Sample
  unknownartifact2:              186,  // Thargoid Probe
  unknownresin:                  10162, // Thargoid Resin
  thargoidscoutttissuesample:    10238, // (guard)
  thargoidscoutttissue:          10238,
  thargoidscoutissuesample:      10238,
  thargoidscout:                 10238,
  thargoidscouttissuesample:     10238,
  thargoidtissuesampletype7:     10448, // Thargoid Scythe Tissue Sample
  unknownartifact:               10226, // Thargoid Sensor
  unknowntechnologysamples:      10163, // Thargoid Technology Samples
  thermalcoolingunits:           105,
  thorium:                       109,
  timecapsule:                   10212,
  thargoidtissuesampletype9a:    10442, // Titan Deep Tissue Sample
  thargoidtitandrivecomponent:   10457,
  titanium:                      48,
  thargoidtissuesampletype10a:   10445, // Titan Maw Deep Tissue Sample
  thargoidtissuesampletype10c:   10446, // Titan Maw Partial Tissue Sample
  thargoidtissuesampletype10b:   10447, // Titan Maw Tissue Sample
  thargoidtissuesampletype9c:    10444, // Titan Partial Tissue Sample
  thargoidtissuesampletype9b:    10443, // Titan Tissue Sample
  tobacco:                       13,
  toxicwaste:                    54,
  usscargotradedta:              134,  // (guard)
  usscargotradedata:             134,
  trinketsoffortune:             135,  // Trinkets of Hidden Fortune
  tritium:                       10269,
  ancientrelictg:                10437, // Unclassified Relic
  unocuppiedescapepod:           10440, // Unoccupied Escape Pod (EDCD typo)
  unstabledatacore:              176,
  uraninite:                     60,
  uranium:                       50,
  opal:                          10250, // Void Opal
  water:                         139,
  waterpurifiers:                82,
  wine:                          14,
  wreckagecomponents:            10207,
};

/**
 * Canonical display names for all known ED commodities, keyed by the lowercase
 * EDCD symbol (same keys as INARA_COMMODITY_IDS). Used as fallback when the
 * journal has not yet provided a Name_Localised for a commodity.
 */
export const COMMODITY_DISPLAY_NAMES = {
  advancedcatalysers:            'Advanced Catalysers',
  advancedmedicines:             'Advanced Medicines',
  agriculturalmedicines:         'Agri-Medicines',
  agronomictreatment:            'Agronomic Treatment',
  airelics:                      'AI Relics',
  alexandrite:                   'Alexandrite',
  algae:                         'Algae',
  aluminium:                     'Aluminium',
  usscargoancientartefact:       'Ancient Artefact',
  ancientkey:                    'Ancient Key',
  animalmeat:                    'Animal Meat',
  animalmonitors:                'Animal Monitors',
  p_particulatesample:           'Anomaly Particles',
  antimattercontainmentunit:     'Antimatter Containment Unit',
  antiquejewellery:              'Antique Jewellery',
  antiquities:                   'Antiquities',
  aquaponicsystems:              'Aquaponic Systems',
  articulationmotors:            'Articulation Motors',
  assaultplans:                  'Assault Plans',
  atmosphericextractors:         'Atmospheric Processors',
  autofabricators:               'Auto-Fabricators',
  basicmedicines:                'Basic Medicines',
  battleweapons:                 'Battle Weapons',
  bauxite:                       'Bauxite',
  beer:                          'Beer',
  benitoite:                     'Benitoite',
  bertrandite:                   'Bertrandite',
  beryllium:                     'Beryllium',
  bioreducinglichen:             'Bio-Reducing Lichen',
  biowaste:                      'Biowaste',
  bismuth:                       'Bismuth',
  usscargoblackbox:              'Black Box',
  thargoidbonefragments:         'Thargoid Bone Fragments',
  bootlegliquor:                 'Bootleg Liquor',
  bromellite:                    'Bromellite',
  buildingfabricators:           'Building Fabricators',
  thargoidgeneratortissuesample: 'Caustic Tissue Sample',
  ceramiccomposites:             'Ceramic Composites',
  chemicalwaste:                 'Chemical Waste',
  clothing:                      'Clothing',
  cmmcomposite:                  'CMM Composite',
  cobalt:                        'Cobalt',
  coffee:                        'Coffee',
  coltan:                        'Coltan',
  combatstabilisers:             'Combat Stabilisers',
  comercialsamples:              'Commercial Samples',
  computercomponents:            'Computer Components',
  conductivefabrics:             'Conductive Fabrics',
  consumertechnology:            'Consumer Technology',
  copper:                        'Copper',
  coralsap:                      'Coral Sap',
  cropharvesters:                'Crop Harvesters',
  cryolite:                      'Cryolite',
  thargoidcystspecimen:          'Thargoid Cyst Specimen',
  damagedescapepod:              'Damaged Escape Pod',
  datacore:                      'Data Core',
  diplomaticbag:                 'Diplomatic Bag',
  domesticappliances:            'Domestic Appliances',
  earthrelics:                   'Earth Relics',
  emergencypowercells:           'Emergency Power Cells',
  encryptedcorrespondence:       'Encrypted Correspondence',
  encripteddatastorage:          'Encrypted Data Storage',
  powergridassembly:             'Energy Grid Assembly',
  evacuationshelter:             'Evacuation Shelter',
  exhaustmanifold:               'Exhaust Manifold',
  usscargoexperimentalchemicals: 'Experimental Chemicals',
  explosives:                    'Explosives',
  fish:                          'Fish',
  foodcartridges:                'Food Cartridges',
  fossilremnants:                'Fossil Remnants',
  fruitandvegetables:            'Fruit and Vegetables',
  gallite:                       'Gallite',
  gallium:                       'Gallium',
  genebank:                      'Gene Bank',
  geologicalequipment:           'Geological Equipment',
  geologicalsamples:             'Geological Samples',
  gold:                          'Gold',
  goslarite:                     'Goslarite',
  grain:                         'Grain',
  grandidierite:                 'Grandidierite',
  ancientcasket:                 'Guardian Casket',
  ancientorb:                    'Guardian Orb',
  ancientrelic:                  'Guardian Relic',
  ancienttablet:                 'Guardian Tablet',
  ancienturn:                    'Guardian Urn',
  ancienttotem:                  'Guardian Totem',
  hazardousenvironmentsuits:     'H.E. Suits',
  haematite:                     'Haematite',
  hafnium178:                    'Hafnium 178',
  diagnosticsensor:              'Hardware Diagnostic Sensor',
  heatsinkinterlink:             'Heatsink Interlink',
  hnshockmount:                  'HN Shock Mount',
  hostage:                       'Hostages',
  hydrogenfuel:                  'Hydrogen Fuel',
  hydrogenperoxide:              'Hydrogen Peroxide',
  imperialslaves:                'Imperial Slaves',
  unknownmineral:                'Impure Spire Mineral',
  indite:                        'Indite',
  indium:                        'Indium',
  insulatingmembrane:            'Insulating Membrane',
  iondistributor:                'Ion Distributor',
  jadeite:                       'Jadeite',
  terrainenrichmentsystems:      'Land Enrichment Systems',
  landmines:                     'Landmines',
  lanthanum:                     'Lanthanum',
  largeexplorationdatacash:      'Large Survey Data Cache',
  leather:                       'Leather',
  lepidolite:                    'Lepidolite',
  liquidoxygen:                  'Liquid Oxygen',
  liquor:                        'Liquor',
  lithium:                       'Lithium',
  lithiumhydroxide:              'Lithium Hydroxide',
  lowtemperaturediomond:         'Low Temperature Diamonds',
  lowtemperaturediamond:         'Low Temperature Diamonds',
  magneticemittercoil:           'Magnetic Emitter Coil',
  marinesupplies:                'Marine Equipment',
  medicaldiagnosticequipment:    'Medical Diagnostic Equipment',
  metaalloys:                    'Meta-Alloys',
  methaneclathrate:              'Methane Clathrate',
  methanolmonohydratecrystals:   'Methanol Monohydrate Crystals',
  coolinghoses:                  'Micro-Weave Cooling Hoses',
  heliostaticfurnaces:           'Microbial Furnaces',
  microcontrollers:              'Microcontrollers',
  militarygradefabrics:          'Military Grade Fabrics',
  militaryintelligence:          'Military Intelligence',
  usscargomilitaryplans:         'Military Plans',
  mineralextractors:             'Mineral Extractors',
  mineraloil:                    'Mineral Oil',
  modularterminals:              'Modular Terminals',
  moissanite:                    'Moissanite',
  m_tissuesample_nerves:         'Mollusc Brain Tissue',
  m_tissuesample_fluid:          'Mollusc Fluid',
  m3_tissuesample_membrane:      'Mollusc Membrane',
  m3_tissuesample_mycelium:      'Mollusc Mycelium',
  m_tissuesample_soft:           'Mollusc Soft Tissue',
  m3_tissuesample_spores:        'Mollusc Spores',
  monazite:                      'Monazite',
  mutomimager:                   'Muon Imager',
  musgravite:                    'Musgravite',
  mysteriousidol:                'Mysterious Idol',
  nanobreakers:                  'Nanobreakers',
  basicnarcotics:                'Narcotics',
  naturalfabrics:                'Natural Fabrics',
  neofabricinsulation:           'Neofabric Insulation',
  nerveagents:                   'Nerve Agents',
  nonlethalweapons:              'Non-Lethal Weapons',
  occupiedcryopod:               'Occupied Escape Pod',
  onionheadc:                    'Onionhead Gamma Strain',
  thargoidorgansample:           'Thargoid Organ Sample',
  osmium:                        'Osmium',
  painite:                       'Painite',
  palladium:                     'Palladium',
  performanceenhancers:          'Performance Enhancers',
  personaleffects:               'Personal Effects',
  personalweapons:               'Personal Weapons',
  pesticides:                    'Pesticides',
  platinum:                      'Platinum',
  s_tissuesample_cells:          'Pod Core Tissue',
  s_tissuesample_surface:        'Pod Dead Tissue',
  s6_tissuesample_mesoglea:      'Pod Mesoglea',
  s6_tissuesample_cells:         'Pod Outer Tissue',
  s6_tissuesample_coenosarc:     'Pod Shell Tissue',
  s_tissuesample_core:           'Pod Surface Tissue',
  s9_tissuesample_shell:         'Pod Tissue',
  politicalprisoner:             'Political Prisoners',
  polymers:                      'Polymers',
  powerconverter:                'Power Converter',
  powergenerators:               'Power Generators',
  powertransferconduits:         'Power Transfer Bus',
  praseodymium:                  'Praseodymium',
  preciousgems:                  'Precious Gems',
  progenitatorcells:             'Progenitor Cells',
  progenitorcells:               'Progenitor Cells',
  prohibitedresearchmaterials:   'Prohibited Research Materials',
  unknownsack:                   'Protective Membrane Scrap',
  usscargoprototypetch:          'Prototype Tech',
  pyrophyllite:                  'Pyrophyllite',
  radiationbaffle:               'Radiation Baffle',
  usscargoreartwork:             'Rare Artwork',
  usscargorareartwork:           'Rare Artwork',
  reactivearmour:                'Reactive Armour',
  usscargorebeltransmissions:    'Rebel Transmissions',
  reinforcedmountingplate:       'Reinforced Mounting Plate',
  resonatingseparators:          'Resonating Separators',
  rhodplumsite:                  'Rhodplumsite',
  robotics:                      'Robotics',
  rockforthfertiliser:           'Rockforth Fertiliser',
  rutile:                        'Rutile',
  samarium:                      'Samarium',
  sap8corecontainer:             'SAP 8 Core Container',
  scientificresearch:            'Scientific Research',
  scientificsamples:             'Scientific Samples',
  scrap:                         'Scrap',
  unknownrefinedmineral:         'Semi-Refined Spire Mineral',
  semiconductors:                'Semiconductors',
  serendibite:                   'Serendibite',
  silver:                        'Silver',
  skimercomponents:              'Skimmer Components',
  slaves:                        'Slaves',
  smallexplorationdatacash:      'Small Survey Data Cache',
  spacepioneerrelics:            'Space Pioneer Relics',
  steel:                         'Steel',
  structuralregulators:          'Structural Regulators',
  superconductors:               'Superconductors',
  surfacestabilisers:            'Surface Stabilisers',
  survivalequipment:             'Survival Equipment',
  syntheticfabrics:              'Synthetic Fabrics',
  syntheticmeat:                 'Synthetic Meat',
  syntheticreagents:             'Synthetic Reagents',
  taaffeite:                     'Taaffeite',
  tacticaldata:                  'Tactical Data',
  tantalum:                      'Tantalum',
  tea:                           'Tea',
  usscargoechnicalblueprints:    'Technical Blueprints',
  usscargotechnicalblueprints:   'Technical Blueprints',
  telemetrysuite:                'Telemetry Suite',
  thallium:                      'Thallium',
  thargoidtissuesampletype2:     'Thargoid Basilisk Tissue Sample',
  unknownbiologicalmatter:       'Thargoid Biological Matter',
  thargoidtissuesampletype1:     'Thargoid Cyclops Tissue Sample',
  thargoidtissuesampletype6:     'Thargoid Glaive Tissue Sample',
  thargoidheart:                 'Thargoid Heart',
  thargoidtissuesampletype4:     'Thargoid Hydra Tissue Sample',
  unknownartifact3:              'Thargoid Link',
  thargoidtissuesampletype3:     'Thargoid Medusa Tissue Sample',
  thargoidtissuesampletype5:     'Thargoid Orthrus Tissue Sample',
  unknownartifact2:              'Thargoid Probe',
  unknownresin:                  'Thargoid Resin',
  thargoidscoutttissuesample:    'Thargoid Scout Tissue Sample',
  thargoidscoutttissue:          'Thargoid Scout Tissue Sample',
  thargoidscoutissuesample:      'Thargoid Scout Tissue Sample',
  thargoidscout:                 'Thargoid Scout Tissue Sample',
  thargoidscouttissuesample:     'Thargoid Scout Tissue Sample',
  thargoidtissuesampletype7:     'Thargoid Scythe Tissue Sample',
  unknownartifact:               'Thargoid Sensor',
  unknowntechnologysamples:      'Thargoid Technology Samples',
  thermalcoolingunits:           'Thermal Cooling Units',
  thorium:                       'Thorium',
  timecapsule:                   'Time Capsule',
  thargoidtissuesampletype9a:    'Titan Deep Tissue Sample',
  thargoidtitandrivecomponent:   'Titan Drive Component',
  titanium:                      'Titanium',
  thargoidtissuesampletype10a:   'Titan Maw Deep Tissue Sample',
  thargoidtissuesampletype10c:   'Titan Maw Partial Tissue Sample',
  thargoidtissuesampletype10b:   'Titan Maw Tissue Sample',
  thargoidtissuesampletype9c:    'Titan Partial Tissue Sample',
  thargoidtissuesampletype9b:    'Titan Tissue Sample',
  tobacco:                       'Tobacco',
  toxicwaste:                    'Toxic Waste',
  usscargotradedta:              'Trade Data',
  usscargotradedata:             'Trade Data',
  trinketsoffortune:             'Trinkets of Hidden Fortune',
  tritium:                       'Tritium',
  ancientrelictg:                'Unclassified Relic',
  unocuppiedescapepod:           'Unoccupied Escape Pod',
  unstabledatacore:              'Unstable Data Core',
  uraninite:                     'Uraninite',
  uranium:                       'Uranium',
  opal:                          'Void Opal',
  water:                         'Water',
  waterpurifiers:                'Water Purifiers',
  wine:                          'Wine',
  wreckagecomponents:            'Wreckage Components',
};

/**
 * Convert a journal internal commodity name to its Inara.cz commodity ID.
 *
 * @param {string} nameInternal  e.g. "$FoodCartridges_Name;" or "FoodCartridges"
 * @returns {number|null}
 */
export function inaraIdFromInternal(nameInternal) {
  if (!nameInternal) return null;
  const symbol = nameInternal
    .replace(/^\$/, '')
    .replace(/_[Nn]ame;$/, '')
    .toLowerCase();
  return INARA_COMMODITY_IDS[symbol] ?? null;
}

/**
 * Build an Inara commodity search URL for a set of commodities near a given system.
 *
 * @param {Array<{name_internal: string}>} commodities
 * @param {string} systemName
 * @param {number} [rangeLy=168]
 * @returns {string|null}  null if no recognisable commodity IDs were found
 */
export function buildInaraSearchUrl(commodities, systemName, rangeLy = 168) {
  const ids = commodities
    .map(c => inaraIdFromInternal(c.name_internal))
    .filter(Boolean);
  if (ids.length === 0) return null;

  const base = 'https://inara.cz/elite/commodities/';
  const params = new URLSearchParams({
    formbrief: '1',
    pi1: '1',   // selling
    pi3: '3',   // sort by distance
    pi5: String(rangeLy),
    pi13: '1',  // include fleet carriers
    ps1: systemName,
  });
  for (const id of ids) {
    params.append('pa1[]', id);
  }
  return `${base}?${params}`;
}
