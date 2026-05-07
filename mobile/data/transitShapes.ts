/**
 * Additional transit shapes extracted from GTFS data.
 * These represent major Jeepney and Bus corridors in Metro Manila.
 */

export const JEEP_SHAPES = [
  // Shape 880814 (Major Corridor)
  [
    { latitude: 14.6035, longitude: 120.983 },
    { latitude: 14.6024, longitude: 120.98707 },
    { latitude: 14.60049, longitude: 120.99078 },
    { latitude: 14.60052, longitude: 120.99149 },
    { latitude: 14.60072, longitude: 120.99205 },
    { latitude: 14.60098, longitude: 120.9929 },
    { latitude: 14.60114, longitude: 120.99349 },
    { latitude: 14.60119, longitude: 120.99402 },
    { latitude: 14.6006, longitude: 120.99598 },
    { latitude: 14.60063, longitude: 120.99651 },
    { latitude: 14.60085, longitude: 120.99727 },
    { latitude: 14.60093, longitude: 120.99771 },
    { latitude: 14.60077, longitude: 120.99805 },
    { latitude: 14.60068, longitude: 120.99831 },
    { latitude: 14.60063, longitude: 120.9986 },
    { latitude: 14.60059, longitude: 120.99889 },
    { latitude: 14.60068, longitude: 120.99921 },
    { latitude: 14.60079, longitude: 120.99958 },
    { latitude: 14.60092, longitude: 120.99982 },
    { latitude: 14.60106, longitude: 121.00016 },
    { latitude: 14.60124, longitude: 121.00128 },
    { latitude: 14.60165, longitude: 121.0042 },
    { latitude: 14.6042, longitude: 121.017 },
    { latitude: 14.60904, longitude: 121.02228 },
    { latitude: 14.6095, longitude: 121.02301 },
    { latitude: 14.6105, longitude: 121.026 },
    { latitude: 14.61251, longitude: 121.03226 },
    { latitude: 14.61533, longitude: 121.03732 },
    { latitude: 14.61799, longitude: 121.04187 },
    { latitude: 14.61922, longitude: 121.04402 },
    { latitude: 14.62096, longitude: 121.04893 },
    { latitude: 14.62299, longitude: 121.05329 },
    { latitude: 14.62769, longitude: 121.06283 },
    { latitude: 14.62804, longitude: 121.06504 },
    { latitude: 14.62841, longitude: 121.06689 },
    { latitude: 14.62883, longitude: 121.06809 },
    { latitude: 14.63111, longitude: 121.07303 },
    { latitude: 14.63252, longitude: 121.07599 },
    { latitude: 14.63255, longitude: 121.07657 },
    { latitude: 14.6323, longitude: 121.0774 },
    { latitude: 14.63184, longitude: 121.07781 },
    { latitude: 14.63068, longitude: 121.07873 },
    { latitude: 14.62596, longitude: 121.08204 },
    { latitude: 14.62434, longitude: 121.08357 },
    { latitude: 14.62392, longitude: 121.08406 },
    { latitude: 14.62326, longitude: 121.08479 },
    { latitude: 14.623, longitude: 121.08512 },
    { latitude: 14.6223, longitude: 121.086 },
  ],
  // Shape 882144 (North-South Corridor)
  [
    { latitude: 14.5339, longitude: 120.998 },
    { latitude: 14.53486, longitude: 120.99874 },
    { latitude: 14.53613, longitude: 120.99975 },
    { latitude: 14.53754, longitude: 121.00074 },
    { latitude: 14.53823, longitude: 121.00078 },
    { latitude: 14.5412, longitude: 121.0002 },
    { latitude: 14.54471, longitude: 120.99941 },
    { latitude: 14.54778, longitude: 120.99861 },
    { latitude: 14.55152, longitude: 120.99775 },
    { latitude: 14.55571, longitude: 120.99681 },
    { latitude: 14.55779, longitude: 120.99634 },
    { latitude: 14.56126, longitude: 120.99561 },
    { latitude: 14.5628, longitude: 120.99514 },
    { latitude: 14.56419, longitude: 120.99451 },
    { latitude: 14.5679, longitude: 120.99282 },
    { latitude: 14.57046, longitude: 120.99153 },
    { latitude: 14.57297, longitude: 120.99011 },
    { latitude: 14.57625, longitude: 120.9882 },
    { latitude: 14.57908, longitude: 120.98664 },
    { latitude: 14.58198, longitude: 120.98501 },
    { latitude: 14.58408, longitude: 120.98383 },
    { latitude: 14.5861, longitude: 120.98265 },
    { latitude: 14.58713, longitude: 120.98205 },
    { latitude: 14.58772, longitude: 120.98213 },
    { latitude: 14.58867, longitude: 120.98226 },
    { latitude: 14.59177, longitude: 120.98194 },
    { latitude: 14.5943, longitude: 120.98117 },
    { latitude: 14.59615, longitude: 120.98069 },
    { latitude: 14.59764, longitude: 120.98093 },
    { latitude: 14.59889, longitude: 120.98134 },
    { latitude: 14.60188, longitude: 120.98185 },
    { latitude: 14.6053, longitude: 121.000 },
    { latitude: 14.60939, longitude: 121.010 },
    { latitude: 14.61315, longitude: 121.020 },
    { latitude: 14.61849, longitude: 121.030 },
    { latitude: 14.62129, longitude: 121.040 },
    { latitude: 14.62405, longitude: 121.050 },
    { latitude: 14.62843, longitude: 121.060 },
    { latitude: 14.6369, longitude: 121.070 },
    { latitude: 14.6561, longitude: 121.080 },
    { latitude: 14.6575, longitude: 121.086 },
  ]
];
export const RAIL_SHAPES: Record<string, { latitude: number, longitude: number }[]> = {
  'MRT-3': [
    { latitude: 14.6522, longitude: 121.0323 }, // North Ave
    { latitude: 14.6500, longitude: 121.0340 },
    { latitude: 14.6432, longitude: 121.0385 }, // Quezon Ave
    { latitude: 14.6354, longitude: 121.0432 }, // Kamuning
    { latitude: 14.6236, longitude: 121.0528 }, // Cubao
    { latitude: 14.6150, longitude: 121.0550 }, 
    { latitude: 14.6016, longitude: 121.0578 }, // Santolan
    { latitude: 14.5950, longitude: 121.0575 },
    { latitude: 14.5876, longitude: 121.0567 }, // Ortigas
    { latitude: 14.5812, longitude: 121.0534 }, // Shaw
    { latitude: 14.5734, longitude: 121.0476 }, // Boni
    { latitude: 14.5654, longitude: 121.0456 }, // Guadalupe
    { latitude: 14.5600, longitude: 121.0400 },
    { latitude: 14.5543, longitude: 121.0345 }, // Buendia
    { latitude: 14.5487, longitude: 121.0278 }, // Ayala
    { latitude: 14.5412, longitude: 121.0198 }, // Magallanes
    { latitude: 14.5385, longitude: 121.0100 },
    { latitude: 14.5378, longitude: 121.0012 }, // Taft
  ],
  'LRT-1': [
    { latitude: 14.6575, longitude: 121.0220 }, // Roosevelt
    { latitude: 14.6576, longitude: 121.0150 }, 
    { latitude: 14.6574, longitude: 121.0040 }, // Balintawak
    { latitude: 14.6568, longitude: 120.9900 },
    { latitude: 14.6561, longitude: 120.9840 }, // Monumento
    { latitude: 14.6500, longitude: 120.9838 }, 
    { latitude: 14.6444, longitude: 120.9835 }, // 5th Ave
    { latitude: 14.6360, longitude: 120.9822 }, // R. Papa
    { latitude: 14.6306, longitude: 120.9822 }, // Abad Santos
    { latitude: 14.6228, longitude: 120.9825 }, // Blumentritt
    { latitude: 14.6168, longitude: 120.9825 }, // Tayuman
    { latitude: 14.6109, longitude: 120.9818 }, // Bambang
    { latitude: 14.6053, longitude: 120.9818 }, // D. Jose
    { latitude: 14.5991, longitude: 120.9812 }, // Carriedo
    { latitude: 14.5928, longitude: 120.9815 }, // Central
    { latitude: 14.5826, longitude: 120.9845 }, // UN Ave
    { latitude: 14.5763, longitude: 120.9882 }, // Pedro Gil
    { latitude: 14.5703, longitude: 120.9918 }, // Quirino
    { latitude: 14.5636, longitude: 120.9948 }, // Vito Cruz
    { latitude: 14.5543, longitude: 120.9968 }, // Gil Puyat
    { latitude: 14.5479, longitude: 120.9988 }, // Libertad
    { latitude: 14.5381, longitude: 121.0008 }, // EDSA
    { latitude: 14.5339, longitude: 120.9978 }, // Baclaran
  ],
  'LRT-2': [
    { latitude: 14.6035, longitude: 120.9838 }, // Recto (Offset from L1)
    { latitude: 14.6008, longitude: 120.9935 }, // Legarda
    { latitude: 14.6015, longitude: 121.0048 }, // Pureza
    { latitude: 14.6025, longitude: 121.0158 }, // V. Mapa
    { latitude: 14.6038, longitude: 121.0268 }, // J. Ruiz
    { latitude: 14.6050, longitude: 121.0325 }, // Gilmore
    { latitude: 14.6105, longitude: 121.0380 }, // Betty Go
    { latitude: 14.6160, longitude: 121.0490 }, // Cubao
    { latitude: 14.6205, longitude: 121.0535 }, // Anonas
    { latitude: 14.6285, longitude: 121.0715 }, // Katipunan
    { latitude: 14.6260, longitude: 121.0780 }, 
    { latitude: 14.6235, longitude: 121.0820 }, 
    { latitude: 14.6225, longitude: 121.0863 }, // Santolan
    { latitude: 14.6215, longitude: 121.0950 }, 
    { latitude: 14.6195, longitude: 121.1012 }, // Marikina-Pasig
    { latitude: 14.6175, longitude: 121.1120 }, 
    { latitude: 14.6152, longitude: 121.1223 }, // Antipolo
  ]
};
