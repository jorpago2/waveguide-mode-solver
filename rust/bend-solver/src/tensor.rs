#[derive(Debug)]
pub struct TensorOperator {
    nx: usize,
    ny: usize,
    k0: f64,
    dx_cell: Vec<f64>,
    dy_cell: Vec<f64>,
    dx_dual: Vec<f64>,
    dy_dual: Vec<f64>,
    epsilon_x: Vec<f64>,
    epsilon_y: Vec<f64>,
    epsilon_xy: Vec<f64>,
    epsilon_xz_nodes: Vec<f64>,
    epsilon_yz_nodes: Vec<f64>,
    epsilon_z_nodes: Vec<f64>,
    epsilon_xz_ex: Vec<f64>,
    epsilon_yz_ey: Vec<f64>,
}

impl TensorOperator {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        nx: usize,
        ny: usize,
        k0: f64,
        dx_cell: Vec<f64>,
        dy_cell: Vec<f64>,
        dx_dual: Vec<f64>,
        dy_dual: Vec<f64>,
        epsilon_xx_cell: Vec<f64>,
        epsilon_yy_cell: Vec<f64>,
        epsilon_zz_cell: Vec<f64>,
        epsilon_xy: Vec<f64>,
        epsilon_xz_cell: Vec<f64>,
        epsilon_yz_cell: Vec<f64>,
    ) -> Result<Self, u32> {
        let cells = nx * ny;
        if nx == 0
            || ny == 0
            || !k0.is_finite()
            || k0 <= 0.0
            || dx_cell.len() != nx
            || dy_cell.len() != ny
            || dx_dual.len() != nx + 1
            || dy_dual.len() != ny + 1
            || [epsilon_xx_cell.len(), epsilon_yy_cell.len(), epsilon_zz_cell.len(), epsilon_xy.len(), epsilon_xz_cell.len(), epsilon_yz_cell.len()]
                .iter()
                .any(|length| *length != cells)
            || dx_cell.iter().chain(&dy_cell).chain(&dx_dual).chain(&dy_dual).any(|value| !value.is_finite() || *value <= 0.0)
        {
            return Err(20);
        }
        let mut epsilon_x = vec![0.0; (ny + 1) * nx];
        let mut epsilon_y = vec![0.0; ny * (nx + 1)];
        let mut epsilon_xz_ex = vec![0.0; (ny + 1) * nx];
        let mut epsilon_yz_ey = vec![0.0; ny * (nx + 1)];
        let mut epsilon_xz_nodes = vec![0.0; (ny + 1) * (nx + 1)];
        let mut epsilon_yz_nodes = vec![0.0; (ny + 1) * (nx + 1)];
        let mut epsilon_z_nodes = vec![0.0; (ny + 1) * (nx + 1)];

        for row in 0..=ny {
            let south = row.saturating_sub(1).min(ny - 1);
            let north = row.min(ny - 1);
            for column in 0..nx {
                let edge = row * nx + column;
                epsilon_x[edge] = 0.5 * (epsilon_xx_cell[south * nx + column] + epsilon_xx_cell[north * nx + column]);
                epsilon_xz_ex[edge] = 0.5 * (epsilon_xz_cell[south * nx + column] + epsilon_xz_cell[north * nx + column]);
            }
        }
        for row in 0..ny {
            for column in 0..=nx {
                let west = column.saturating_sub(1).min(nx - 1);
                let east = column.min(nx - 1);
                let edge = row * (nx + 1) + column;
                epsilon_y[edge] = 0.5 * (epsilon_yy_cell[row * nx + west] + epsilon_yy_cell[row * nx + east]);
                epsilon_yz_ey[edge] = 0.5 * (epsilon_yz_cell[row * nx + west] + epsilon_yz_cell[row * nx + east]);
            }
        }
        for row in 0..=ny {
            let south = row.saturating_sub(1).min(ny - 1);
            let north = row.min(ny - 1);
            for column in 0..=nx {
                let west = column.saturating_sub(1).min(nx - 1);
                let east = column.min(nx - 1);
                let node = row * (nx + 1) + column;
                let indices = [south * nx + west, south * nx + east, north * nx + west, north * nx + east];
                epsilon_z_nodes[node] = 0.25 * indices.iter().map(|index| epsilon_zz_cell[*index]).sum::<f64>();
                epsilon_xz_nodes[node] = 0.25 * indices.iter().map(|index| epsilon_xz_cell[*index]).sum::<f64>();
                epsilon_yz_nodes[node] = 0.25 * indices.iter().map(|index| epsilon_yz_cell[*index]).sum::<f64>();
            }
        }
        Ok(Self {
            nx,
            ny,
            k0,
            dx_cell,
            dy_cell,
            dx_dual,
            dy_dual,
            epsilon_x,
            epsilon_y,
            epsilon_xy,
            epsilon_xz_nodes,
            epsilon_yz_nodes,
            epsilon_z_nodes,
            epsilon_xz_ex,
            epsilon_yz_ey,
        })
    }

    pub fn physical_size(&self) -> usize {
        2 * (self.ny * (self.nx + 1) + (self.ny + 1) * self.nx)
    }

    pub fn apply(&self, input: &[f64]) -> Result<Vec<f64>, u32> {
        let nx = self.nx;
        let ny = self.ny;
        let hx_size = ny * (nx + 1);
        let hy_size = (ny + 1) * nx;
        let physical_size = 2 * (hx_size + hy_size);
        if input.len() != physical_size {
            return Err(21);
        }
        let ex_offset = 0;
        let ey_offset = hy_size;
        let hx_offset = hy_size + hx_size;
        let hy_offset = hy_size + 2 * hx_size;
        let mut output = vec![0.0; physical_size];
        let mut ex_cell = vec![0.0; nx * ny];
        let mut ey_cell = vec![0.0; nx * ny];
        let mut ex_node = vec![0.0; (nx + 1) * (ny + 1)];
        let mut ey_node = vec![0.0; (nx + 1) * (ny + 1)];
        let mut ez_node = vec![0.0; (nx + 1) * (ny + 1)];
        let mut longitudinal_e = vec![0.0; nx * ny];

        for row in 0..ny {
            for column in 0..nx {
                let cell = row * nx + column;
                ex_cell[cell] = 0.5 * (input[ex_offset + row * nx + column] + input[ex_offset + (row + 1) * nx + column]);
                ey_cell[cell] = 0.5 * (input[ey_offset + row * (nx + 1) + column] + input[ey_offset + row * (nx + 1) + column + 1]);
                longitudinal_e[cell] = (input[ex_offset + (row + 1) * nx + column] - input[ex_offset + row * nx + column]) / self.dy_cell[row]
                    - (input[ey_offset + row * (nx + 1) + column + 1] - input[ey_offset + row * (nx + 1) + column]) / self.dx_cell[column];
            }
        }
        for row in 0..=ny {
            for column in 0..=nx {
                let node = row * (nx + 1) + column;
                let west = column.saturating_sub(1).min(nx - 1);
                let east = column.min(nx - 1);
                let south = row.saturating_sub(1).min(ny - 1);
                let north = row.min(ny - 1);
                ex_node[node] = 0.5 * (input[ex_offset + row * nx + west] + input[ex_offset + row * nx + east]);
                ey_node[node] = 0.5 * (input[ey_offset + south * (nx + 1) + column] + input[ey_offset + north * (nx + 1) + column]);
                let south_hx = if row > 0 { input[hx_offset + (row - 1) * (nx + 1) + column] } else { 0.0 };
                let north_hx = if row < ny { input[hx_offset + row * (nx + 1) + column] } else { 0.0 };
                let west_hy = if column > 0 { input[hy_offset + row * nx + column - 1] } else { 0.0 };
                let east_hy = if column < nx { input[hy_offset + row * nx + column] } else { 0.0 };
                let displacement_z = (north_hx - south_hx) / self.dy_dual[row] - (east_hy - west_hy) / self.dx_dual[column];
                ez_node[node] = (displacement_z - self.epsilon_xz_nodes[node] * ex_node[node] - self.epsilon_yz_nodes[node] * ey_node[node])
                    / self.epsilon_z_nodes[node];
            }
        }
        for row in 0..=ny {
            for column in 0..nx {
                let edge = row * nx + column;
                output[ex_offset + edge] = (ez_node[row * (nx + 1) + column + 1] - ez_node[row * (nx + 1) + column]) / (self.k0 * self.dx_cell[column])
                    - self.k0 * input[hy_offset + edge];
                let south = row.saturating_sub(1).min(ny - 1) * nx + column;
                let north = row.min(ny - 1) * nx + column;
                let cross_y = 0.5 * (self.epsilon_xy[south] * ey_cell[south] + self.epsilon_xy[north] * ey_cell[north]);
                let ez_at_ex = 0.5 * (ez_node[row * (nx + 1) + column] + ez_node[row * (nx + 1) + column + 1]);
                let displacement_x = self.epsilon_x[edge] * input[ex_offset + edge] + cross_y + self.epsilon_xz_ex[edge] * ez_at_ex;
                let south_longitudinal = if row > 0 { longitudinal_e[(row - 1) * nx + column] } else { 0.0 };
                let north_longitudinal = if row < ny { longitudinal_e[row * nx + column] } else { 0.0 };
                output[hy_offset + edge] = -(north_longitudinal - south_longitudinal) / (self.k0 * self.dy_dual[row]) - self.k0 * displacement_x;
            }
        }
        for row in 0..ny {
            for column in 0..=nx {
                let edge = row * (nx + 1) + column;
                output[ey_offset + edge] = (ez_node[(row + 1) * (nx + 1) + column] - ez_node[row * (nx + 1) + column]) / (self.k0 * self.dy_cell[row])
                    + self.k0 * input[hx_offset + edge];
                let west = row * nx + column.saturating_sub(1).min(nx - 1);
                let east = row * nx + column.min(nx - 1);
                let cross_x = 0.5 * (self.epsilon_xy[west] * ex_cell[west] + self.epsilon_xy[east] * ex_cell[east]);
                let ez_at_ey = 0.5 * (ez_node[row * (nx + 1) + column] + ez_node[(row + 1) * (nx + 1) + column]);
                let displacement_y = self.epsilon_y[edge] * input[ey_offset + edge] + cross_x + self.epsilon_yz_ey[edge] * ez_at_ey;
                let west_longitudinal = if column > 0 { longitudinal_e[row * nx + column - 1] } else { 0.0 };
                let east_longitudinal = if column < nx { longitudinal_e[row * nx + column] } else { 0.0 };
                output[hx_offset + edge] = -(east_longitudinal - west_longitudinal) / (self.k0 * self.dx_dual[column]) + self.k0 * displacement_y;
            }
        }
        Ok(output)
    }
}
