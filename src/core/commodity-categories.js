// Maps lowercase EDCD commodity symbols to ED market categories.
// Used to bundle Inara queries by category, reducing API calls.
// Symbol extraction: strip leading "$" and trailing "_Name;" (case-insensitive), lowercase.

export const COMMODITY_CATEGORIES = {
  // Chemicals
  explosives:              'Chemicals',
  hydrogenfuel:            'Chemicals',
  mineraloil:              'Chemicals',
  pesticides:              'Chemicals',
  liquidoxygen:            'Chemicals',
  hydrogenperoxide:        'Chemicals',
  surfacestabilisers:      'Chemicals',
  syntheticreagents:       'Chemicals',
  nerveagents:             'Chemicals',

  // Consumer Items
  consumertechnology:      'ConsumerItems',
  domesticappliances:      'ConsumerItems',
  clothing:                'ConsumerItems',
  leather:                 'ConsumerItems',

  // Foods
  algae:                   'Foods',
  animalmeat:              'Foods',
  beer:                    'Foods',
  coffee:                  'Foods',
  fish:                    'Foods',
  foodcartridges:          'Foods',
  fruitandvegetables:      'Foods',
  grain:                   'Foods',
  liquor:                  'Foods',
  syntheticmeat:           'Foods',
  tea:                     'Foods',

  // Industrial Materials
  ceramiccomposites:       'IndustrialMaterials',
  polymers:                'IndustrialMaterials',
  semiconductors:          'IndustrialMaterials',
  superconductors:         'IndustrialMaterials',
  cmmcomposite:            'IndustrialMaterials',
  insulatingmembrane:      'IndustrialMaterials',
  metaalloys:              'IndustrialMaterials',

  // Legal Drugs
  basicnarcotics:          'LegalDrugs',
  onionheadc:              'LegalDrugs',

  // Machinery
  atmosphericextractors:   'Machinery',
  cropharvesters:          'Machinery',
  mineralextractors:       'Machinery',
  powergenerators:         'Machinery',
  heliostaticfurnaces:     'Machinery',
  skimercomponents:        'Machinery',
  skimmercomponents:       'Machinery',
  geologicalequipment:     'Machinery',
  buildingfabricators:     'Machinery',

  // Medicines
  agriculturalmedicines:   'Medicines',
  basicmedicines:          'Medicines',
  combatstabilisers:       'Medicines',
  performanceenhancers:    'Medicines',
  progenitorcells:         'Medicines',
  progenitatorcells:       'Medicines',
  advancedmedicines:       'Medicines',

  // Metals
  aluminium:               'Metals',
  beryllium:               'Metals',
  bismuth:                 'Metals',
  cobalt:                  'Metals',
  copper:                  'Metals',
  gallium:                 'Metals',
  gold:                    'Metals',
  hafnium178:              'Metals',
  indium:                  'Metals',
  lanthanum:               'Metals',
  lithium:                 'Metals',
  osmium:                  'Metals',
  palladium:               'Metals',
  platinum:                'Metals',
  praseodymium:            'Metals',
  samarium:                'Metals',
  silver:                  'Metals',
  steel:                   'Metals',
  tantalum:                'Metals',
  thallium:                'Metals',
  titanium:                'Metals',
  zinc:                    'Metals',
  zirconium:               'Metals',

  // Minerals
  bauxite:                 'Minerals',
  bertrandite:             'Minerals',
  coltan:                  'Minerals',
  gallite:                 'Minerals',
  goslarite:               'Minerals',
  haematite:               'Minerals',
  indite:                  'Minerals',
  lepidolite:              'Minerals',
  moissanite:              'Minerals',
  pyrophyllite:            'Minerals',
  rutile:                  'Minerals',
  uraninite:               'Minerals',

  // Technology
  advancedcatalysers:      'Technology',
  animalmonitors:          'Technology',
  aquaponicsystems:        'Technology',
  autofabricators:         'Technology',
  bioreducinglichen:       'Technology',
  computercomponents:      'Technology',
  hazardousenvironmentsuits: 'Technology',
  terrainenrichmentsystems: 'Technology',
  resonatingseparators:    'Technology',
  robotics:                'Technology',
  agronomictreatment:      'Technology',
  microcontrollers:        'Technology',

  // Textiles
  conductivefabrics:       'Textiles',
  militarygradefabrics:    'Textiles',
  naturalfabrics:          'Textiles',
  syntheticfabrics:        'Textiles',
  neofabricinsulation:     'Textiles',

  // Weapons
  battleweapons:           'Weapons',
  nonlethalweapons:        'Weapons',
  personalweapons:         'Weapons',
  reactivearmour:          'Weapons',
};
