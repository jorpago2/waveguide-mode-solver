use faer::{
    c64,
    linalg::solvers::Solve,
    sparse::{
        linalg::solvers::{Lu, SymbolicLu},
        SparseColMat, Triplet,
    },
    Mat,
};

pub struct SparseOperator {
    size: usize,
    pointers: Vec<usize>,
    rows: Vec<usize>,
    values: Vec<c64>,
    complex: bool,
    factorization_shift: f64,
    factorization: Option<Lu<usize, c64>>,
}

impl SparseOperator {
    pub fn new(size: usize, pointers: Vec<u32>, rows: Vec<u32>, real: Vec<f64>, imaginary: Vec<f64>) -> Result<Self, u32> {
        if size == 0 || pointers.len() != size + 1 || rows.len() != real.len() || real.len() != imaginary.len() || pointers[size] as usize != rows.len() {
            return Err(30);
        }
        let pointers: Vec<usize> = pointers.into_iter().map(|value| value as usize).collect();
        let rows: Vec<usize> = rows.into_iter().map(|value| value as usize).collect();
        if rows.iter().any(|row| *row >= size)
            || pointers.windows(2).any(|window| window[0] > window[1])
            || real.iter().chain(&imaginary).any(|value| !value.is_finite())
        {
            return Err(30);
        }
        let complex = imaginary.iter().any(|value| value.abs() > 1e-15);
        let values = real.into_iter().zip(imaginary).map(|(re, im)| c64::new(re, im)).collect();
        Ok(Self { size, pointers, rows, values, complex, factorization_shift: f64::NAN, factorization: None })
    }

    pub fn physical_size(&self) -> usize {
        self.size
    }

    pub fn is_complex(&self) -> bool {
        self.complex
    }

    pub fn apply(&self, input: &[f64]) -> Result<Vec<f64>, u32> {
        let expected = self.size * if self.complex { 2 } else { 1 };
        if input.len() != expected {
            return Err(31);
        }
        let mut output = vec![c64::new(0.0, 0.0); self.size];
        for column in 0..self.size {
            let input_value = c64::new(input[column], if self.complex { input[self.size + column] } else { 0.0 });
            for entry in self.pointers[column]..self.pointers[column + 1] {
                output[self.rows[entry]] += self.values[entry] * input_value;
            }
        }
        if self.complex {
            let mut joined = Vec::with_capacity(2 * self.size);
            joined.extend(output.iter().map(|value| value.re));
            joined.extend(output.iter().map(|value| value.im));
            Ok(joined)
        } else {
            Ok(output.into_iter().map(|value| value.re).collect())
        }
    }

    pub fn solve_shifted(&mut self, shift: f64, right_hand_side: &[f64]) -> Result<Vec<f64>, u32> {
        let expected = self.size * if self.complex { 2 } else { 1 };
        if right_hand_side.len() != expected || !shift.is_finite() {
            return Err(32);
        }
        if self.factorization.is_none() || self.factorization_shift != shift {
            self.factorize(shift)?;
        }
        let factorization = self.factorization.as_ref().ok_or(36_u32)?;
        let mut right = Mat::<c64>::from_fn(self.size, 1, |row, _| {
            c64::new(right_hand_side[row], if self.complex { right_hand_side[self.size + row] } else { 0.0 })
        });
        factorization.solve_in_place(right.as_mut());
        let mut output = Vec::with_capacity(expected);
        output.extend((0..self.size).map(|row| right[(row, 0)].re));
        if self.complex {
            output.extend((0..self.size).map(|row| right[(row, 0)].im));
        }
        let mut residual = self.apply(&output)?;
        for index in 0..expected {
            residual[index] -= shift * output[index] + right_hand_side[index];
        }
        let residual_norm = residual.iter().map(|value| value * value).sum::<f64>().sqrt();
        let right_norm = right_hand_side.iter().map(|value| value * value).sum::<f64>().sqrt().max(1e-15);
        if !residual_norm.is_finite() || residual_norm / right_norm > 1e-7 {
            return Err(37);
        }
        Ok(output)
    }

    fn factorize(&mut self, shift: f64) -> Result<(), u32> {
        let mut triplets = Vec::with_capacity(self.values.len() + self.size);
        for column in 0..self.size {
            let mut diagonal_found = false;
            for entry in self.pointers[column]..self.pointers[column + 1] {
                let row = self.rows[entry];
                let mut value = self.values[entry];
                if row == column {
                    value.re -= shift;
                    diagonal_found = true;
                }
                triplets.push(Triplet::new(row, column, value));
            }
            if !diagonal_found {
                triplets.push(Triplet::new(column, column, c64::new(-shift, 0.0)));
            }
        }
        let matrix = SparseColMat::<usize, c64>::try_new_from_triplets(self.size, self.size, &triplets).map_err(|_| 33_u32)?;
        let symbolic = SymbolicLu::try_new(matrix.symbolic()).map_err(|_| 34_u32)?;
        self.factorization = Some(Lu::try_new_with_symbolic(symbolic, matrix.as_ref()).map_err(|_| 35_u32)?);
        self.factorization_shift = shift;
        Ok(())
    }
}
