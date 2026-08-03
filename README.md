# Waveguide Mode Solver

Browser-based educational full-vector finite-difference eigenmode solver for integrated photonics.

It solves full-vector straight and constant-radius bent-waveguide eigenproblems on a Yee grid and reconstructs all six field components. Supported cross-sections are channel, rib, slot, two-guide coupler, multilayer ridge and user-defined polygon waveguides.

## Features

- Uniform, manually graded or automatic axis-specific center-graded transverse mesh with subpixel interface averaging and geometry-aligned interfaces on resolved grids.
- Technology presets for SOI strip, rib and slot guides, SiN, thin-film lithium niobate, weak-guidance silica and polymer platforms.
- Trapezoidal etched sidewalls specified by the top width and angle from the substrate plane (90° is vertical).
- Editable or JSON-imported non-overlapping convex polygon regions with independent isotropic material models and exact cell-area subpixel fractions.
- Dominant-field TE/TM mode labels with transverse node counts, symmetry metrics, cutoff warnings and family-aware sweep tracking.
- Dispersive material models for Si, Ge, Si₃N₄, As₂S₃, LiNbO₃, sapphire, MgF₂, AlN, GaAs, InP and 4H-SiC, including uniaxial orientation where applicable.
- MgO:LiNbO₃ temperature and uniform optical-axis Pockels controls using the ordinary and extraordinary indices.
- Editable finite layers below the core with a semi-infinite base substrate.
- Arbitrarily oriented uniaxial anisotropy, ε = εₒI + (εₑ − εₒ)aaᵀ, including xz/yz coupling, solved by a Rust/WebAssembly four-field first-order Maxwell operator.
- Imported isotropic `wavelength_um,n,k` CSV material tables with bounded linear interpolation and no extrapolation.
- Dispersive bulk-metal models for Ag, Au and Al, plus a plasmonic shift target derived from the planar-interface SPP dispersion relation.
- Local linear material dispersion, dn/dλ, about a chosen reference wavelength.
- Complex-eigenvalue material attenuation and cubic stretched-coordinate PML boundaries.
- Rigorous constant-radius bends using a radial coordinate transformation: the metric factor 1 + x/R enters the material operators, a reduced transverse-electric eigenproblem is solved, and all six fields are reconstructed.
- Wavelength sweeps with reciprocal complex-field, near-degenerate-subspace mode tracking.
- Complex-field maps for Re, Im, magnitude and phase of all six electromagnetic components, with reciprocal unconjugated E×H tracking for lossy and leaky modes.
- Width, height, slot-gap and bend-radius sweeps with resampled reciprocal subspace tracking.
- Effective and imaginary index, group index, D and β₂ dispersion, attenuation, electric and power confinement, polarization fractions and effective area.
- Complex Poynting-vector normalization to 1 mW modal power.
- Material-resolved absorption, propagation length and eigenvalue-versus-power-balance loss diagnostics.
- Brillouin dispersive stored energy, energy confinement, energy effective area and energy-velocity group index, with explicit loss-regime validity labels.
- Stored-energy PML participation, boundary participation and automatic straight-guide PML-mode rejection; bent modes remain subject to convergence checks rather than participation-only rejection.
- PEC/PMC x/y symmetry projections for compatible straight cross-sections, reducing the modal state by approximately 2× per selected plane while retaining full-domain field exports.
- Bloch-periodic x/y boundary pairs with independent phase in [−π, π]; zero phase gives ordinary periodicity and PML can remain on the non-periodic transverse axis.
- Transverse Bloch-phase dispersion sweeps showing every calculated eigenvalue, a tracked modal branch, loss and ±θ reciprocity error.
- Automated three-grid mode tracking with observed order, Richardson extrapolation and fine-grid GCI.
- One-at-a-time PML robustness checks for boundary distance, absorber thickness and strength, with configurable loss tolerance and pass/review status.
- Plotly field maps with an independent 1×/2×/4× interpolated display mesh, transverse cuts, sweep plots and raw solver-grid CSV exports.
- Solved cross-section inspector with real, imaginary and magnitude maps of complex refractive index and permittivity, selected-mode intensity contours, actual nonuniform mesh boundaries and PML-onset markers.
- A unified Rust/WebAssembly core evaluates diagonal, tensor and transformed-bend operators, runs shifted linear solves and computes the shift-invert Arnoldi eigensystem. Complex bent modes retain the validated TypeScript reduced-matrix eigendecomposition for stable conjugate-pair selection while their operator and sparse LU remain in Rust.
- Wavelength and geometry sweeps recycle the preceding modal subspace. A persistent Web Worker keeps the interface responsive and transfers field grids without copying their buffers.
- Published dispersive material models for crystalline silicon, stoichiometric silicon nitride and fused silica, with explicit wavelength ranges.
- Seeded Latin-hypercube width, height, gap, sidewall-angle and core-index tolerance studies with distribution intervals and correlation-based sensitivity ranking.
- Gaussian-beam overlap and identical two-guide directional-coupler supermode analysis.
- Modal power-overlap and effective-index-mismatch matrices between two waveguide cross-sections.
- Two-dimensional mode-count and effective-index maps for visualizing cutoff regions.
- Versioned JSON project export/import plus numeric CSV exports.
- User-defined complex effective-index targets and an inspectable Ritz-candidate table with residuals and rejection reasons.
- Advanced mode-interaction diagnostics with projected Ritz-eigenvector conditioning, right-vector overlap matrices and one-parameter complex-mode branch sweeps.

## Run locally

Requires Node.js, pnpm and the Rust toolchain with the `wasm32-unknown-unknown` target. The pinned toolchain is declared in `rust-toolchain.toml`.

```bash
pnpm install
pnpm dev
```

## Validate

```bash
pnpm test
pnpm run build
```

The tests exercise automated three-grid convergence, subpixel and polygon-interface convergence, the finest supported grid, every geometry, manual and automatic graded meshes, transverse and longitudinal anisotropic coupling, complex loss, dispersive energy, PML participation, PEC/PMC symmetry projection, reciprocal Bloch phases and phase sweeps in x/y, power normalization, dielectric and metallic material models, dielectric-slab, MIM, IMI and planar gold/air SPP benchmarks, vertical stacks, mode classification, seeded tolerances, coupling, cross-section comparison, modal maps, the infinite-radius limit, bend-direction symmetry and radiative bend loss.

## Numerical scope

- Linear, local, non-magnetic media. Straight guides support diagonal complex permittivity, including negative real permittivity; arbitrary real symmetric tensors require hard boundaries. The phasor convention is exp(iβz − iωt), so passive media have Im(ε) ≥ 0 and Im(β) ≥ 0.
- Built-in metal data use a bulk Lorentz–Drude fit over 0.1–6 eV (0.207–12.4 µm). Thin-film morphology, surface scattering, temperature dependence and nonlocal response are not included; import measured n,k data when available. Metallic bends are outside the validated scope.
- Curved guides must have a constant radius larger than the entire radial half-domain. Varying-radius transitions, Euler bends and longitudinal discontinuities are outside the 2D eigenmode model.
- Hard-wall and PML outer boundaries are available. Radiation loss requires mesh, padding, PML-thickness and PML-strength convergence checks.
- The reported GCI applies to effective-index mesh discretization only and is valid only when the three grids converge monotonically in the asymptotic range.
- The PML is intended for open-boundary mode studies; a nonzero imaginary effective index alone does not establish that a physical mode is leaky.
- PEC/PMC symmetry requires a genuinely mirror-symmetric straight geometry and diagonal material tensor. The solver rejects incompatible bends, vertical stacks, ribs or angled-sidewall y symmetry.
- Bloch-periodic boundaries represent an infinite transverse array, require matching material distributions on paired faces and currently support straight guides with diagonal tensors. Longitudinally periodic Bragg or photonic-crystal waveguides require a separate 3D unit-cell or propagation formulation.
- Brillouin stored-energy metrics are rigorous for lossless dispersive media, approximate for weak loss and diagnostic for strongly absorptive media.
- dn/dλ is a local linear model. Use a sufficiently narrow sweep and verify the material data range.
- Group index and dispersion are numerical finite differences and require wavelength-step convergence.
- Mode labels are inferred from the dominant real transverse electric-field component. Treat labels near degeneracies, strong hybridization or asymmetric geometries as diagnostic rather than exact quantum numbers.
- Modes within 10⁻⁴ in effective index are tracked as a shared subspace. The subspace is continuous under basis rotation, but an individual eigenvector inside an exact degeneracy is not uniquely defined.
- Finite stack layers are horizontal and lie below the core. Dielectric guidance requires a core index above the exterior; metallic stacks instead use a surface-plasmon search interval. High-index-substrate leakage still requires a dedicated leaky-mode formulation and PML convergence study.
- User-defined regions are convex and must not overlap; combine several regions to represent a concave cross-section. GDSII layer mapping and curved polygon edges are not imported directly.
- The LiNbO₃ temperature correction applies the congruent-LN wavelength-dependent thermo-optic fit of Moretti et al. to the 5% MgO Sellmeier base as an approximation and is restricted to 20–240 °C. Its electro-optic control assumes a uniform DC field parallel to the optical axis and uses telecom values r₁₃ = 8.6 pm/V and r₃₃ = 30.8 pm/V; process-specific data are required and it does not solve electrodes or RF/optical overlap.
- Deposited-film composition, temperature and process variation require custom measured data for quantitative designs.
- Gaussian overlap neglects facet reflection. Directional-coupler length assumes identical guides and no longitudinal discontinuities.
- The reported projected condition number and Kproj = kappa_proj^2 come from the small Arnoldi Ritz matrix. They diagnose non-normal sensitivity of the computed eigensystem but are not a full-Maxwell adjoint Petermann factor. Exceptional-point labels are candidates only; confirmation requires a converged closed loop in two real parameters.

## References

The complete, feature-mapped bibliography and traceability notes are maintained in [REFERENCES.md](REFERENCES.md).

### Core references

A. B. Fallahkhair, K. S. Li, and T. E. Murphy, “Vector Finite Difference Modesolver for Anisotropic Dielectric Waveguides,” *Journal of Lightwave Technology* 26(11), 1423–1431 (2008). [doi:10.1109/JLT.2008.923643](https://doi.org/10.1109/JLT.2008.923643)

The cylindrical finite-difference basis for the curved formulation is described by J. Xiao, K. Ni, and X. Sun, “Full-vectorial mode solver for bent waveguides based on two-dimensional finite-difference frequency-domain method,” *Optics Letters* 33, 1848–1850 (2008), [doi:10.1364/OL.33.001848](https://doi.org/10.1364/OL.33.001848).

Material models: [Malitson fused silica](https://doi.org/10.1364/JOSA.55.001205), [Li crystalline silicon and germanium](https://doi.org/10.1063/1.555624), [Luke et al. silicon nitride](https://doi.org/10.1364/OL.40.004823), [Rodney et al. arsenic trisulfide](https://doi.org/10.1364/JOSA.48.000633), [Zelmon et al. MgO:LiNbO₃](https://doi.org/10.1364/JOSAB.14.003319), Malitson and Dodge sapphire, [Dodge magnesium fluoride](https://doi.org/10.1364/AO.23.001980), [Moretti et al. LiNbO₃ thermo-optics](https://doi.org/10.1063/1.1988987), [Pastrňák and Roskovcová AlN](https://doi.org/10.1002/pssb.19660140140), [Skauli et al. GaAs](https://doi.org/10.1063/1.1621740), [Pettit and Turner InP](https://doi.org/10.1063/1.1714393), [Wang et al. 4H-SiC](https://doi.org/10.1002/lpor.201300068), and [Rakic et al. bulk-metal models](https://doi.org/10.1364/AO.37.005271).

## License

MIT
