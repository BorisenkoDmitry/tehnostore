import { Navigate, useLocation } from "react-router-dom"

const ConstructorAttributesPage = () => {
  const { search } = useLocation()
  return <Navigate to={{ pathname: "/catalog-constructor/products", search }} replace />
}
export default ConstructorAttributesPage
