use faer::c64;

#[derive(Debug)]
pub struct VectorOperator {
    nx: usize,
    ny: usize,
    k0: f64,
    dx_cell: Vec<f64>,
    dy_cell: Vec<f64>,
    dx_dual: Vec<f64>,
    dy_dual: Vec<f64>,
    epsilon_x: Vec<c64>,
    epsilon_y: Vec<c64>,
    inverse_epsilon_z: Vec<c64>,
    stretch_x_cell: Vec<c64>,
    stretch_x_node: Vec<c64>,
    stretch_y_cell: Vec<c64>,
    stretch_y_node: Vec<c64>,
    complex: bool,
}

impl VectorOperator {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        nx: usize,
        ny: usize,
        k0: f64,
        dx_cell: Vec<f64>,
        dy_cell: Vec<f64>,
        dx_dual: Vec<f64>,
        dy_dual: Vec<f64>,
        epsilon_x_real: Vec<f64>,
        epsilon_x_imaginary: Vec<f64>,
        epsilon_y_real: Vec<f64>,
        epsilon_y_imaginary: Vec<f64>,
        inverse_epsilon_z_real: Vec<f64>,
        inverse_epsilon_z_imaginary: Vec<f64>,
        stretch_x_cell_real: Vec<f64>,
        stretch_x_cell_imaginary: Vec<f64>,
        stretch_x_node_real: Vec<f64>,
        stretch_x_node_imaginary: Vec<f64>,
        stretch_y_cell_real: Vec<f64>,
        stretch_y_cell_imaginary: Vec<f64>,
        stretch_y_node_real: Vec<f64>,
        stretch_y_node_imaginary: Vec<f64>,
    ) -> Result<Self, u32> {
        let hx_size = ny * (nx + 1);
        let hy_size = (ny + 1) * nx;
        let node_size = (ny + 1) * (nx + 1);
        if nx == 0
            || ny == 0
            || !k0.is_finite()
            || k0 <= 0.0
            || dx_cell.len() != nx
            || dy_cell.len() != ny
            || dx_dual.len() != nx + 1
            || dy_dual.len() != ny + 1
            || epsilon_x_real.len() != hy_size
            || epsilon_y_real.len() != hx_size
            || inverse_epsilon_z_real.len() != node_size
            || epsilon_x_imaginary.len() != hy_size
            || epsilon_y_imaginary.len() != hx_size
            || inverse_epsilon_z_imaginary.len() != node_size
            || stretch_x_cell_real.len() != nx
            || stretch_x_cell_imaginary.len() != nx
            || stretch_x_node_real.len() != nx + 1
            || stretch_x_node_imaginary.len() != nx + 1
            || stretch_y_cell_real.len() != ny
            || stretch_y_cell_imaginary.len() != ny
            || stretch_y_node_real.len() != ny + 1
            || stretch_y_node_imaginary.len() != ny + 1
            || dx_cell.iter().chain(&dy_cell).chain(&dx_dual).chain(&dy_dual).any(|value| !value.is_finite() || *value <= 0.0)
        {
            return Err(10);
        }
        let complex = epsilon_x_imaginary
            .iter()
            .chain(&epsilon_y_imaginary)
            .chain(&inverse_epsilon_z_imaginary)
            .chain(&stretch_x_cell_imaginary)
            .chain(&stretch_x_node_imaginary)
            .chain(&stretch_y_cell_imaginary)
            .chain(&stretch_y_node_imaginary)
            .any(|value| value.abs() > 1e-15);
        Ok(Self {
            nx,
            ny,
            k0,
            dx_cell,
            dy_cell,
            dx_dual,
            dy_dual,
            epsilon_x: zip_complex(epsilon_x_real, epsilon_x_imaginary),
            epsilon_y: zip_complex(epsilon_y_real, epsilon_y_imaginary),
            inverse_epsilon_z: zip_complex(inverse_epsilon_z_real, inverse_epsilon_z_imaginary),
            stretch_x_cell: zip_complex(stretch_x_cell_real, stretch_x_cell_imaginary),
            stretch_x_node: zip_complex(stretch_x_node_real, stretch_x_node_imaginary),
            stretch_y_cell: zip_complex(stretch_y_cell_real, stretch_y_cell_imaginary),
            stretch_y_node: zip_complex(stretch_y_node_real, stretch_y_node_imaginary),
            complex,
        })
    }

    pub fn physical_size(&self) -> usize {
        self.ny * (self.nx + 1) + (self.ny + 1) * self.nx
    }

    pub fn is_complex(&self) -> bool {
        self.complex
    }

    pub fn apply(&self, input: &[f64]) -> Result<Vec<f64>, u32> {
        let size = self.physical_size();
        if input.len() != size * if self.complex { 2 } else { 1 } {
            return Err(11);
        }
        let values: Vec<c64> = if self.complex {
            (0..size).map(|index| c64::new(input[index], input[size + index])).collect()
        } else {
            input.iter().map(|value| c64::new(*value, 0.0)).collect()
        };
        let output = self.apply_complex(&values);
        if self.complex {
            let mut joined = Vec::with_capacity(2 * size);
            joined.extend(output.iter().map(|value| value.re));
            joined.extend(output.iter().map(|value| value.im));
            Ok(joined)
        } else {
            Ok(output.into_iter().map(|value| value.re).collect())
        }
    }

    fn apply_complex(&self, input: &[c64]) -> Vec<c64> {
        let nx = self.nx;
        let ny = self.ny;
        let hx_size = ny * (nx + 1);
        let hy_size = (ny + 1) * nx;
        let hx = &input[..hx_size];
        let hy = &input[hx_size..hx_size + hy_size];
        let mut divergence = add(&self.bx(hx), &self.by(hy));
        let mut curl = subtract(&self.dy_operator(hx), &self.dx_operator(hy));
        multiply_in_place(&mut curl, &self.inverse_epsilon_z);
        let ay_curl = self.ay(&curl);
        let ax_curl = self.ax(&curl);
        let correction = subtract(&self.bx(&ay_curl), &self.by(&ax_curl));
        add_scaled(&mut divergence, &correction, 1.0 / (self.k0 * self.k0));
        let mut output_hx = self.cx(&divergence);
        let mut output_hy = self.cy(&divergence);
        add_product(&mut output_hx, &ay_curl, &self.epsilon_y, 1.0);
        add_product(&mut output_hy, &ax_curl, &self.epsilon_x, -1.0);
        add_product(&mut output_hx, hx, &self.epsilon_y, self.k0 * self.k0);
        add_product(&mut output_hy, hy, &self.epsilon_x, self.k0 * self.k0);
        output_hx.extend(output_hy);
        output_hx
    }

    fn bx(&self, edges: &[c64]) -> Vec<c64> {
        let mut output = vec![c64::new(0.0, 0.0); self.nx * self.ny];
        for row in 0..self.ny {
            for column in 0..self.nx {
                output[row * self.nx + column] = (edges[row * (self.nx + 1) + column + 1] - edges[row * (self.nx + 1) + column])
                    / self.dx_cell[column]
                    * self.stretch_x_cell[column];
            }
        }
        output
    }

    fn by(&self, edges: &[c64]) -> Vec<c64> {
        let mut output = vec![c64::new(0.0, 0.0); self.nx * self.ny];
        for row in 0..self.ny {
            for column in 0..self.nx {
                output[row * self.nx + column] = (edges[(row + 1) * self.nx + column] - edges[row * self.nx + column])
                    / self.dy_cell[row]
                    * self.stretch_y_cell[row];
            }
        }
        output
    }

    fn ax(&self, nodes: &[c64]) -> Vec<c64> {
        let mut output = vec![c64::new(0.0, 0.0); (self.ny + 1) * self.nx];
        for row in 0..=self.ny {
            for column in 0..self.nx {
                output[row * self.nx + column] = (nodes[row * (self.nx + 1) + column + 1] - nodes[row * (self.nx + 1) + column])
                    / self.dx_cell[column]
                    * self.stretch_x_cell[column];
            }
        }
        output
    }

    fn ay(&self, nodes: &[c64]) -> Vec<c64> {
        let mut output = vec![c64::new(0.0, 0.0); self.ny * (self.nx + 1)];
        for row in 0..self.ny {
            for column in 0..=self.nx {
                output[row * (self.nx + 1) + column] = (nodes[(row + 1) * (self.nx + 1) + column] - nodes[row * (self.nx + 1) + column])
                    / self.dy_cell[row]
                    * self.stretch_y_cell[row];
            }
        }
        output
    }

    fn cx(&self, cells: &[c64]) -> Vec<c64> {
        let mut output = vec![c64::new(0.0, 0.0); self.ny * (self.nx + 1)];
        for row in 0..self.ny {
            for column in 0..=self.nx {
                let west = if column > 0 { cells[row * self.nx + column - 1] } else { c64::new(0.0, 0.0) };
                let east = if column < self.nx { cells[row * self.nx + column] } else { c64::new(0.0, 0.0) };
                output[row * (self.nx + 1) + column] = (east - west) / self.dx_dual[column] * self.stretch_x_node[column];
            }
        }
        output
    }

    fn cy(&self, cells: &[c64]) -> Vec<c64> {
        let mut output = vec![c64::new(0.0, 0.0); (self.ny + 1) * self.nx];
        for row in 0..=self.ny {
            for column in 0..self.nx {
                let south = if row > 0 { cells[(row - 1) * self.nx + column] } else { c64::new(0.0, 0.0) };
                let north = if row < self.ny { cells[row * self.nx + column] } else { c64::new(0.0, 0.0) };
                output[row * self.nx + column] = (north - south) / self.dy_dual[row] * self.stretch_y_node[row];
            }
        }
        output
    }

    fn dx_operator(&self, edges: &[c64]) -> Vec<c64> {
        let mut output = vec![c64::new(0.0, 0.0); (self.nx + 1) * (self.ny + 1)];
        for row in 0..=self.ny {
            for column in 0..=self.nx {
                let west = if column > 0 { edges[row * self.nx + column - 1] } else { c64::new(0.0, 0.0) };
                let east = if column < self.nx { edges[row * self.nx + column] } else { c64::new(0.0, 0.0) };
                output[row * (self.nx + 1) + column] = (east - west) / self.dx_dual[column] * self.stretch_x_node[column];
            }
        }
        output
    }

    fn dy_operator(&self, edges: &[c64]) -> Vec<c64> {
        let mut output = vec![c64::new(0.0, 0.0); (self.nx + 1) * (self.ny + 1)];
        for row in 0..=self.ny {
            for column in 0..=self.nx {
                let south = if row > 0 { edges[(row - 1) * (self.nx + 1) + column] } else { c64::new(0.0, 0.0) };
                let north = if row < self.ny { edges[row * (self.nx + 1) + column] } else { c64::new(0.0, 0.0) };
                output[row * (self.nx + 1) + column] = (north - south) / self.dy_dual[row] * self.stretch_y_node[row];
            }
        }
        output
    }
}

fn zip_complex(real: Vec<f64>, imaginary: Vec<f64>) -> Vec<c64> {
    real.into_iter().zip(imaginary).map(|(re, im)| c64::new(re, im)).collect()
}

fn add(first: &[c64], second: &[c64]) -> Vec<c64> {
    first.iter().zip(second).map(|(a, b)| *a + *b).collect()
}

fn subtract(first: &[c64], second: &[c64]) -> Vec<c64> {
    first.iter().zip(second).map(|(a, b)| *a - *b).collect()
}

fn multiply_in_place(target: &mut [c64], factor: &[c64]) {
    for (value, multiplier) in target.iter_mut().zip(factor) {
        *value *= *multiplier;
    }
}

fn add_scaled(target: &mut [c64], source: &[c64], factor: f64) {
    for (value, addend) in target.iter_mut().zip(source) {
        *value += *addend * factor;
    }
}

fn add_product(target: &mut [c64], source: &[c64], factor: &[c64], scale: f64) {
    for ((value, source), factor) in target.iter_mut().zip(source).zip(factor) {
        *value += *source * *factor * scale;
    }
}
