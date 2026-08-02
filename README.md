# Waveguide Mode Solver

Browser-based educational full-vector finite-difference eigenmode solver for integrated photonics.

It solves full-vector straight and constant-radius bent-waveguide eigenproblems on a Yee grid and reconstructs all six field components. Supported cross-sections are channel, rib, slot, two-guide coupler and multilayer ridge waveguides.

## Features

- Uniform or center-graded transverse mesh with subpixel interface averaging and geometry-aligned interfaces on resolved grids.
- Technology presets for SOI strip, rib and slot guides, SiN, thin-film lithium niobate, weak-guidance silica and polymer platforms.
- Trapezoidal etched sidewalls specified by the top width and angle from the substrate plane (90° is vertical).
- Dominant-field TE/TM mode labels with transverse node counts, symmetry metrics, cutoff warnings and family-aware sweep tracking.
- Dispersive material models for LiNbO₃, AlN, GaAs, InP and 4H-SiC, including uniaxial orientation where applicable.
- MgO:LiNbO₃ temperature and uniform optical-axis Pockels controls using the ordinary and extraordinary indices.
- Editable finite layers below the core with a semi-infinite base substrate.
- Arbitrarily oriented uniaxial anisotropy, ε = εₒI + (εₑ − εₒ)aaᵀ, including xz/yz coupling, solved by a WebAssembly four-field first-order Maxwell operator.
- Imported isotropic `wavelength_um,n,k` CSV material tables with bounded linear interpolation and no extrapolation.
- Local linear material dispersion, dn/dλ, about a chosen reference wavelength.
- Complex-eigenvalue material attenuation and cubic stretched-coordinate PML boundaries.
- Rigorous constant-radius bends in local cylindrical coordinates, retaining the metric factor 1 + x/R in the six-component Maxwell eigenproblem.
- Wavelength sweeps with field-overlap mode tracking.
- Width, height, slot-gap and bend-radius sweeps with resampled field-overlap mode tracking.
- Effective and imaginary index, group index, D and β₂ dispersion, attenuation, electric and power confinement, polarization fractions and effective area.
- Complex Poynting-vector normalization to 1 W modal power.
- Automated three-grid mode tracking with observed order, Richardson extrapolation and fine-grid GCI.
- One-at-a-time PML robustness checks for boundary distance, absorber thickness and strength, with configurable loss tolerance and pass/review status.
- Plotly field maps, transverse cuts, sweep plots and CSV exports.
- Solved cross-section inspector with principal-index maps, selected-mode intensity contours, actual nonuniform mesh boundaries and PML-onset markers.
- Matrix-free shift-invert Arnoldi with adaptively preconditioned BiCGSTAB inner solves, SIMD WebAssembly kernels for diagonal and tensor operators, restarted GMRES for non-Hermitian bent-PML systems and residual rejection.
- Wavelength and geometry sweeps recycle the preceding modal subspace. A persistent Web Worker keeps the interface responsive and transfers field grids without copying their buffers.
- Published dispersive material models for crystalline silicon, stoichiometric silicon nitride and fused silica, with explicit wavelength ranges.
- Seeded Latin-hypercube width, height, gap, sidewall-angle and core-index tolerance studies with distribution intervals and correlation-based sensitivity ranking.
- Gaussian-beam overlap and identical two-guide directional-coupler supermode analysis.
- Modal power-overlap and effective-index-mismatch matrices between two waveguide cross-sections.
- Two-dimensional mode-count and effective-index maps for visualizing cutoff regions.
- Versioned JSON project export/import plus numeric CSV exports.

## Run locally

```bash
pnpm install
pnpm dev
```

## Validate

```bash
pnpm test
pnpm run build
```

The tests exercise automated three-grid convergence, subpixel convergence, the finest supported grid, every geometry, graded meshes, transverse and longitudinal anisotropic coupling, complex loss, PML, power normalization, material models, vertical stacks, mode classification, seeded tolerances, coupling, cross-section comparison, modal maps, the infinite-radius limit, bend-direction symmetry and radiative bend loss.

## Numerical scope

- Linear, non-magnetic dielectrics. Arbitrary real symmetric permittivity tensors are available for straight, lossless guides with hard boundaries; bends, PML and material loss currently require diagonal tensors.
- Curved guides must have a constant radius larger than the entire radial half-domain. Varying-radius transitions, Euler bends and longitudinal discontinuities are outside the 2D eigenmode model.
- Hard-wall and PML outer boundaries are available. Radiation loss requires mesh, padding, PML-thickness and PML-strength convergence checks.
- The reported GCI applies to effective-index mesh discretization only and is valid only when the three grids converge monotonically in the asymptotic range.
- The PML is intended for open-boundary mode studies; a nonzero imaginary effective index alone does not establish that a physical mode is leaky.
- dn/dλ is a local linear model. Use a sufficiently narrow sweep and verify the material data range.
- Group index and dispersion are numerical finite differences and require wavelength-step convergence.
- Mode labels are inferred from the dominant real transverse electric-field component. Treat labels near degeneracies, strong hybridization or asymmetric geometries as diagnostic rather than exact quantum numbers.
- Finite stack layers are horizontal and lie below the core. Exterior indices must remain below the core index; high-index-substrate leakage requires a dedicated leaky-mode formulation and PML convergence study.
- The LiNbO₃ temperature correction applies the congruent-LN wavelength-dependent thermo-optic fit of Moretti et al. to the 5% MgO Sellmeier base as an approximation and is restricted to 20–240 °C. Its electro-optic control assumes a uniform DC field parallel to the optical axis and uses telecom values r₁₃ = 8.6 pm/V and r₃₃ = 30.8 pm/V; process-specific data are required and it does not solve electrodes or RF/optical overlap.
- Deposited-film composition, temperature and process variation require custom measured data for quantitative designs.
- Gaussian overlap neglects facet reflection. Directional-coupler length assumes identical guides and no longitudinal discontinuities.

## Reference

A. B. Fallahkhair, K. S. Li, and T. E. Murphy, “Vector Finite Difference Modesolver for Anisotropic Dielectric Waveguides,” *Journal of Lightwave Technology* 26(11), 1423–1431 (2008). [doi:10.1109/JLT.2008.923643](https://doi.org/10.1109/JLT.2008.923643)

The curved formulation follows the local-cylindrical full-vector finite-difference method and cylindrical PML treatment in J. Xiao, K. Ni, and X. Sun, “Full-vectorial mode solver for bent waveguides based on two-dimensional finite-difference frequency-domain method,” *Optics Letters* 33, 1848–1850 (2008), [doi:10.1364/OL.33.001848](https://doi.org/10.1364/OL.33.001848), and J. Xiao and X. Sun, “A modified full-vectorial finite-difference beam propagation method based on the H-field equations and the cylindrical coordinate system,” *Optics Express* 20, 21583–21597 (2012), [doi:10.1364/OE.20.021583](https://doi.org/10.1364/OE.20.021583).

Material models: [Malitson fused silica](https://doi.org/10.1364/JOSA.55.001205), [Li crystalline silicon](https://doi.org/10.1063/1.555624), [Luke et al. silicon nitride](https://doi.org/10.1364/OL.40.004823), [Zelmon et al. MgO:LiNbO₃](https://doi.org/10.1364/JOSAB.14.003319), [Moretti et al. LiNbO₃ thermo-optics](https://doi.org/10.1063/1.1988987), [Pastrňák and Roskovcová AlN](https://doi.org/10.1002/pssb.19660140140), [Skauli et al. GaAs](https://doi.org/10.1063/1.1621740), [Pettit and Turner InP](https://doi.org/10.1063/1.1714393), and [Wang et al. 4H-SiC](https://doi.org/10.1002/lpor.201300068).

## License

MIT
