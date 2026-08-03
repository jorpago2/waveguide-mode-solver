# Scientific references

This file records the external scientific sources used to formulate, parameterize or validate the solver. A citation here does not imply that the software reproduces every method or result in the cited work.

## Numerical formulation and validation

1. A. B. Fallahkhair, K. S. Li, and T. E. Murphy, “Vector Finite Difference Modesolver for Anisotropic Dielectric Waveguides,” *Journal of Lightwave Technology* 26, 1423–1431 (2008). [doi:10.1109/JLT.2008.923643](https://doi.org/10.1109/JLT.2008.923643). Basis for the full-vector transverse finite-difference formulation and anisotropic benchmark cases.
2. J. Xiao, K. Ni, and X. Sun, “Full-vectorial mode solver for bent waveguides based on two-dimensional finite-difference frequency-domain method,” *Optics Letters* 33, 1848–1850 (2008). [doi:10.1364/OL.33.001848](https://doi.org/10.1364/OL.33.001848). Reference for the cylindrical-coordinate constant-radius bend formulation.
3. J.-P. Bérenger, “A perfectly matched layer for the absorption of electromagnetic waves,” *Journal of Computational Physics* 114, 185–200 (1994). [doi:10.1006/jcph.1994.1159](https://doi.org/10.1006/jcph.1994.1159). Reference for perfectly matched absorbing boundaries; this solver uses a frequency-domain stretched-coordinate implementation.
4. A. Farjadpour et al., “Improving accuracy by subpixel smoothing in the finite-difference time domain,” *Optics Letters* 31, 2972–2974 (2006). [doi:10.1364/OL.31.002972](https://doi.org/10.1364/OL.31.002972). Motivation for interface-aware subpixel material averaging. The implementation here uses cell-area fractions rather than copying the paper’s tensor smoothing scheme.
5. I. B. Celik et al., “Procedure for Estimation and Reporting of Uncertainty Due to Discretization in CFD Applications,” *Journal of Fluids Engineering* 130, 078001 (2008). [doi:10.1115/1.2960953](https://doi.org/10.1115/1.2960953). Reference for Richardson extrapolation and grid-convergence-index reporting.
6. M. D. McKay, R. J. Beckman, and W. J. Conover, “A Comparison of Three Methods for Selecting Values of Input Variables in the Analysis of Output from a Computer Code,” *Technometrics* 21, 239–245 (1979). [doi:10.2307/1268522](https://doi.org/10.2307/1268522). Reference for Latin-hypercube tolerance sampling.

## Complex, lossy and plasmonic modes

7. C. Vassallo, “Radiating normal modes of lossy planar waveguides,” *Journal of the Optical Society of America* 69, 311–316 (1979). [doi:10.1364/JOSA.69.000311](https://doi.org/10.1364/JOSA.69.000311). Reference for orthogonality in lossy planar waveguides and the reciprocal, unconjugated modal product used for tracking.
8. B. Huang, L. Yang, Y.-L. Tian, and J.-R. Qian, “Intuitive Equivalence Between Radiation Modes and Quasi-Leaky Modes in Optical Waveguides,” *Journal of Lightwave Technology* 35, 1640–1645 (2017). [doi:10.1109/JLT.2017.2663198](https://doi.org/10.1109/JLT.2017.2663198). Reference for normalization, orthogonality and interpretation of quasi-leaky numerical modes.
9. J. Chen, G. A. Smolyakov, S. R. J. Brueck, and K. J. Malloy, “Surface plasmon modes of finite, planar, metal-insulator-metal plasmonic waveguides,” *Optics Express* 16, 14902–14909 (2008). [doi:10.1364/OE.16.014902](https://doi.org/10.1364/OE.16.014902). Reference for the MIM/IMI planar dispersion benchmarks, propagation length and confinement checks.
10. A. D. Rakić et al., “Optical properties of metallic films for vertical-cavity optoelectronic devices,” *Applied Optics* 37, 5271–5283 (1998). [doi:10.1364/AO.37.005271](https://doi.org/10.1364/AO.37.005271). Source of the built-in Lorentz–Drude parameters for Ag, Au and Al.

## Dielectric and electro-optic material models

11. I. H. Malitson, “Interspecimen Comparison of the Refractive Index of Fused Silica,” *Journal of the Optical Society of America* 55, 1205–1209 (1965). [doi:10.1364/JOSA.55.001205](https://doi.org/10.1364/JOSA.55.001205). Fused-silica Sellmeier model.
12. H. H. Li, “Refractive index of silicon and germanium and its wavelength and temperature derivatives,” *Journal of Physical and Chemical Reference Data* 9, 561–658 (1980). [doi:10.1063/1.555624](https://doi.org/10.1063/1.555624). Crystalline-silicon dispersion model at 293 K.
13. K. Luke et al., “Broadband mid-infrared frequency comb generation in a Si₃N₄ microresonator,” *Optics Letters* 40, 4823–4826 (2015). [doi:10.1364/OL.40.004823](https://doi.org/10.1364/OL.40.004823). Stoichiometric-silicon-nitride Sellmeier fit reported with the measured platform.
14. D. E. Zelmon, D. L. Small, and D. Jundt, “Infrared corrected Sellmeier coefficients for congruently grown lithium niobate and 5 mol% magnesium oxide-doped lithium niobate,” *Journal of the Optical Society of America B* 14, 3319–3322 (1997). [doi:10.1364/JOSAB.14.003319](https://doi.org/10.1364/JOSAB.14.003319). Ordinary and extraordinary 5% MgO:LiNbO₃ Sellmeier models.
15. L. Moretti et al., “Temperature dependence of the thermo-optic coefficient of lithium niobate, from 300 to 515 K in the visible and infrared regions,” *Journal of Applied Physics* 98, 036101 (2005). [doi:10.1063/1.1988987](https://doi.org/10.1063/1.1988987). Approximate LiNbO₃ temperature correction.
16. F. Pastrňák and L. Roskovcová, optical-dispersion measurements of AlN, *physica status solidi (b)* 14 (1966). [doi:10.1002/pssb.19660140140](https://doi.org/10.1002/pssb.19660140140). Ordinary and extraordinary AlN dispersion model.
17. T. Skauli et al., “Improved dispersion relations for GaAs and applications to nonlinear optics,” *Journal of Applied Physics* 94, 6447–6455 (2003). [doi:10.1063/1.1621740](https://doi.org/10.1063/1.1621740). GaAs Sellmeier model.
18. G. D. Pettit and W. J. Turner, refractive-index dispersion measurements of InP, *Journal of Applied Physics* 36 (1965). [doi:10.1063/1.1714393](https://doi.org/10.1063/1.1714393). InP Sellmeier model.
19. S. Wang et al., “4H-SiC: a new nonlinear material for midinfrared lasers,” *Laser & Photonics Reviews* 7, 831–838 (2013). [doi:10.1002/lpor.201300068](https://doi.org/10.1002/lpor.201300068). Ordinary and extraordinary 4H-SiC dispersion models.
20. J. E. Toney, *Lithium Niobate Photonics*, Artech House (2015), ISBN 978-1-60807-923-0. Source for the telecom electro-optic values used by the simplified uniform-field control, r₁₃ = 8.6 pm/V and r₃₃ = 30.8 pm/V.

## Traceability notes

- The phasor convention is exp(iβz − iωt); passive media therefore use Im(ε) ≥ 0 and Im(β) ≥ 0.
- The complex-field loss check uses the standard time-averaged dissipated-power density, ωε₀ E*·Im(ε)E/2, and compares its integrated attenuation with Im(β). This identity follows directly from the frequency-domain Poynting theorem rather than from a fitted empirical model.
- The dielectric-slab benchmark is the standard even-TE transcendental relation. The MIM and IMI checks solve the symmetric three-layer TM boundary-matching relation. These reference equations are implemented independently in `src/benchmarks.ts`.
- Built-in material formulas should not be interpreted as process-specific film data. Imported measured n,k tables take precedence for quantitative fabrication studies.
